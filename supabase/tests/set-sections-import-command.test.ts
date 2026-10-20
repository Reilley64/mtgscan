import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { importUserAgent } from '../import/source-file';
import { getSet, type SetDetails } from '../sets';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runImportCommand, type CommandResult } from './catalog-import-command';
import { replyOf } from './database-calls';
import { anonymousClient, asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { storeSetSections } from './set-section-seeds';

setDefaultTimeout(120_000);

const prismaticPiper = 'c78c2713-39e7-4a6e-a132-027099a89665';
const captureOfJingzhou = 'f87d0298-f76b-4ea8-82c4-5861c4539d8b';
const vizierOfTumblingSands = 'a9aef509-50f0-4848-87d5-3c169453186f';
const smotheringTitheVariant = '2309fb66-3aa0-4ec5-9a8e-5a0caa19c270';
const teferiTemporalArchmage = 'ba86947e-5d7c-4cf1-9d33-98b289d56108';
const krenkoMobBoss = 'ae883514-2e5f-4ea3-bccc-3c475f70121a';
const roilCartographer = '84317f9d-5a24-4f74-9c3e-0a8b5c15bb5f';
const scurrilousSentry = '29e2805f-59fa-4a6d-97bc-266191b2aa8d';
const snowCoveredWastes = '87870792-e429-4eba-8193-cdce5c7b6c55';
const roilCartographerVariant = '7b9b743b-340d-4a15-a71d-d3108adbdc45';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const lightningBolt = 'd573ef03-4730-45aa-93dd-e45ac1dbaf4a';
const leoninLightscribe = '2a465d7b-398c-444b-9eae-331ea2513f6d';
const humiliate = 'dc3ae8cb-fbdb-45a8-83c2-cbf4aff01f90';
const theBiblioplex = '8eae4481-977f-4bb7-bb1a-ab7100e6ba47';
const suspiciousShambler = 'ff36347c-1fc1-4493-8e45-ef3372ecce45';
const alchemyCard = 'e1b7a4d2-6a1c-4c8e-9d3f-0b2a5c7e9f11';

const setsUnderTest = ['cmm', 'mh3', 'pip', 'who'];

type FakeReply = { status: number; body: string | object };

type FakeRequest = { path: string; search: string | null; unique: string | null; userAgent: string | null; at: number };

let user: TestUser;
let storedSets: string[];
let scryfall: ReturnType<typeof Bun.serve>;
const replies = new Map<string, FakeReply[]>();
const requests: FakeRequest[] = [];

function searchKey(search: string, page = 1) {
  return `search ${search} page ${page}`;
}

type PageStyle = 'newer' | 'older';

function setPageHtml(sections: [name: string, search: string][], style: PageStyle) {
  const headers = sections.map(([name, search]) => {
    const searchUrl = `/search?${new URLSearchParams({ order: 'set', q: search, unique: 'prints' })}`;
    const href = (style === 'older' ? `https://scryfall.com${searchUrl}` : searchUrl).replaceAll('&', '&amp;');
    return `<h2 class="card-grid-header"${style === 'newer' ? ` id="${name.toLowerCase().replaceAll(' ', '-')}"` : ''}>
 <span class="card-grid-header-inner">
  <span class="card-grid-header-content">
   ${style === 'older' ? `<a id="${name.toLowerCase().replaceAll(' ', '')}"></a>` : ''}
   ${name}
   <span class="card-grid-header-dot">
    •
   </span>
   <a href="${href}">
    3 cards
   </a>
  </span>
 </span>
</h2>
<div class="card-grid"></div>`;
  });
  return `<!DOCTYPE html><html><body><div class="set-header"><h1>Set</h1></div>${headers.join('\n')}</body></html>`;
}

function serveSetPage(code: string, sections: [name: string, search: string][], style: PageStyle = 'newer') {
  replies.set(`/sets/${code}`, [{ status: 200, body: setPageHtml(sections, style) }]);
}

function servePage(code: string, ...queue: FakeReply[]) {
  replies.set(`/sets/${code}`, queue);
}

const tooManyRequests: FakeReply = {
  status: 429,
  body: { object: 'error', code: 'rate_limited', status: 429, details: 'Too many requests.' },
};

async function storeSetSectionsToReadAgain(code: string, cardPrintingIds: string[]) {
  await storeSetSections(code, [{ name: 'Stored cards', search: `e:${code}`, card_printing_ids: cardPrintingIds }]);
  await asDatabaseOwner((database) => database`update public.card_sets set set_sections_read_at = null where code = ${code}`);
}

function serveNoCardsFound(search: string) {
  replies.set(searchKey(search), [
    {
      status: 404,
      body: {
        object: 'error',
        code: 'not_found',
        status: 404,
        details: 'Your query didn’t match any cards. Adjust your search terms or refer to the syntax guide at https://scryfall.com/docs/reference',
      },
    },
  ]);
}

function serveSearch(search: string, ...pages: string[][]) {
  pages.forEach((ids, index) => {
    const more = index < pages.length - 1;
    const next = new URL('/cards/search', scryfall.url);
    next.search = new URLSearchParams({ q: search, unique: 'prints', page: String(index + 2) }).toString();
    replies.set(searchKey(search, index + 1), [
      {
        status: 200,
        body: {
          object: 'list',
          total_cards: pages.flat().length,
          has_more: more,
          ...(more ? { next_page: next.toString() } : {}),
          data: ids.map((id) => ({ object: 'card', id })),
        },
      },
    ]);
  });
}

function fakeScryfall() {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const search = url.searchParams.get('q');
      requests.push({
        path: url.pathname,
        search,
        unique: url.searchParams.get('unique'),
        userAgent: request.headers.get('user-agent'),
        at: performance.now(),
      });
      const key = url.pathname === '/cards/search' ? searchKey(search ?? '', Number(url.searchParams.get('page') ?? 1)) : url.pathname;
      const queue = replies.get(key);
      const reply = queue && queue.length > 1 ? queue.shift() : queue?.[0];
      if (!reply) {
        return new Response(`The fake Scryfall has no reply for ${key}`, { status: 500 });
      }
      return typeof reply.body === 'string' ? new Response(reply.body, { status: reply.status }) : Response.json(reply.body, { status: reply.status });
    },
  });
}

function runSetSectionsImport(): Promise<CommandResult> {
  const base = scryfall.url.origin;
  return runImportCommand('set_sections', '--scryfall-site', base, '--scryfall-api', base);
}

async function listedSetCodes(): Promise<string[]> {
  const rows = await asDatabaseOwner(
    (database) => database`select card_set.code from public.card_sets card_set where private.is_listed_set(card_set)`,
  );
  return rows.map((row: { code: string }) => row.code);
}

function gapsBetween(kind: (request: FakeRequest) => boolean) {
  const times = requests.filter(kind).map((request) => request.at);
  return times.slice(1).map((time, index) => time - times[index]!);
}

function shown(section: SetDetails['sections'][number] | SetDetails['other']) {
  return {
    ...('name' in section ? { name: section.name } : {}),
    collector_numbers: section.card_printings.map((printing) => printing.collector_number),
  };
}

beforeAll(async () => {
  scryfall = fakeScryfall();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  user = await signUpNewUser();
  storedSets = (await listedSetCodes()).filter((code) => !setsUnderTest.includes(code));
  await Promise.all(
    storedSets.map((code) => storeSetSections(code, [{ name: 'Stored cards', search: `e:${code}`, card_printing_ids: [] }])),
  );
});

afterAll(() => {
  scryfall.stop();
});

describe('the set sections import', () => {
  let result: CommandResult;

  beforeAll(async () => {
    serveSetPage('cmm', [
      ['Etched Foils', 'e:cmm cn≥473 cn≤543'],
      ['Draft Cards', 'e:cmm cn≥1 cn≤131'],
    ]);
    serveSearch('e:cmm cn≥473 cn≤543', [smotheringTitheVariant, teferiTemporalArchmage, krenkoMobBoss, alchemyCard]);
    serveSearch('e:cmm cn≥1 cn≤131', [prismaticPiper, captureOfJingzhou], [vizierOfTumblingSands]);
    serveSetPage(
      'mh3',
      [
        ['In Boosters', 'set:mh3 is:booster'],
        ['Full Art Basics', 'set:mh3 type:basic is:fullart'],
        ['Godzilla Series', 'set:mh3 is:godzillaseries'],
        ['Roil Cartographers', 'set:mh3 !"Roil Cartographer"'],
      ],
      'older',
    );
    serveSearch('set:mh3 is:booster', [roilCartographer, scurrilousSentry, snowCoveredWastes]);
    serveSearch('set:mh3 type:basic is:fullart', [snowCoveredWastes]);
    serveNoCardsFound('set:mh3 is:godzillaseries');
    serveSearch('set:mh3 !"Roil Cartographer"', [roilCartographer, roilCartographerVariant]);
    await storeSetSectionsToReadAgain('lea', [counterspell, lightningBolt]);
    servePage('lea', { status: 503, body: 'Scryfall is down for maintenance.' });
    servePage('who', { status: 200, body: '<!DOCTYPE html><html><body><div class="card-grid"></div></body></html>' });
    servePage('pip', {
      status: 200,
      body: setPageHtml([['In Boosters', 'set:pip is:booster']], 'newer').replace(/<a href="[^"]*">\s*3 cards\s*<\/a>/, '3 cards'),
    });

    result = await runSetSectionsImport();
  });

  test("stores the set sections of a page with collector number range searches in Scryfall's order, with every page of each search's results, and other holds the card printings that no set section lists", async () => {
    const cmm = await replyOf(user.client, getSet, { code: 'cmm' });

    expect(cmm.sections.map(shown)).toEqual([
      { name: 'Etched Foils', collector_numbers: ['473', '500', '543'] },
      { name: 'Draft Cards', collector_numbers: ['1', '79', '131'] },
    ]);
    expect(shown(cmm.other)).toEqual({ collector_numbers: ['720', '753', '878'] });
  });

  test('stores the set sections of a page with rule searches, with a card printing in two set sections, and leaves out basic lands and searches with no cards found', async () => {
    const mh3 = await replyOf(user.client, getSet, { code: 'mh3' });

    expect(mh3.sections.map(shown)).toEqual([
      { name: 'In Boosters', collector_numbers: ['67', '108'] },
      { name: 'Roil Cartographers', collector_numbers: ['67', '511'] },
    ]);
    expect(shown(mh3.other)).toEqual({ collector_numbers: [] });
  });

  test('a failed read of a set is logged with its reason, keeps its stored set sections, and the import goes on with the next set', async () => {
    const lea = await replyOf(user.client, getSet, { code: 'lea' });
    const pip = await replyOf(user.client, getSet, { code: 'pip' });
    const who = await replyOf(user.client, getSet, { code: 'who' });

    expect(result.output).toContain('lea: its set page answered HTTP 503');
    expect(result.output).toContain('pip: the set section header "In Boosters" has no search link');
    expect(result.output).toContain('who: its set page has no set section headers');
    expect(lea.sections.map(shown)).toEqual([{ name: 'Stored cards', collector_numbers: ['54', '161'] }]);
    expect(pip.sections).toEqual([]);
    expect(who.sections).toEqual([]);
    expect(requests.map((request) => request.path).filter((path) => path.startsWith('/sets/'))).toEqual([
      '/sets/cmm',
      '/sets/lea',
      '/sets/mh3',
      '/sets/pip',
      '/sets/who',
    ]);
  });

  test('exits non-zero and names each set it could not read', () => {
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Set sections failed for lea, pip, who.');
  });

  test('sends at most 1 set page read and at most 2 card searches a second, each search with unique prints, and every request with the import user agent', () => {
    const pageReadGaps = gapsBetween((request) => request.path.startsWith('/sets/'));
    const searchGaps = gapsBetween((request) => request.path === '/cards/search');

    expect(pageReadGaps).toHaveLength(4);
    expect(Math.min(...pageReadGaps)).toBeGreaterThanOrEqual(990);
    expect(searchGaps).toHaveLength(6);
    expect(Math.min(...searchGaps)).toBeGreaterThanOrEqual(490);
    expect(requests.filter((request) => request.path === '/cards/search').every((request) => request.unique === 'prints')).toBe(true);
    expect(requests.every((request) => request.userAgent === importUserAgent)).toBe(true);
  });

  test('logs the number of sets read, skipped, and failed, and the number of searches it ran', () => {
    const skipped = storedSets.length - 1;

    expect(result.output).toContain(`Set sections: 2 sets read, ${skipped} skipped, 3 failed, 6 searches run.`);
  });
});

describe('a 429 reply', () => {
  let result: CommandResult;

  function expectOneWaitOf30Seconds(gaps: number[]) {
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toBeGreaterThanOrEqual(29_990);
  }

  beforeAll(async () => {
    requests.length = 0;
    await storeSetSectionsToReadAgain('j22', [suspiciousShambler]);
    await storeSetSectionsToReadAgain('stx', []);
    servePage('j22', tooManyRequests, tooManyRequests);
    serveSetPage('stx', [['In Boosters', 'set:stx is:booster']]);
    serveSearch('set:stx is:booster', [leoninLightscribe, humiliate, theBiblioplex]);
    replies.get(searchKey('set:stx is:booster'))!.unshift(tooManyRequests);

    result = await runSetSectionsImport();
  }, 150_000);

  test('waits 30 seconds and tries the request again', async () => {
    const stx = await replyOf(user.client, getSet, { code: 'stx' });

    expectOneWaitOf30Seconds(gapsBetween((request) => request.search === 'set:stx is:booster'));
    expect(stx.sections.map(shown)).toEqual([{ name: 'In Boosters', collector_numbers: ['20', '193', '264'] }]);
  });

  test('a second 429 for the same request is a failed read that keeps the stored set sections', async () => {
    const j22 = await replyOf(user.client, getSet, { code: 'j22' });

    expectOneWaitOf30Seconds(gapsBetween((request) => request.path === '/sets/j22'));
    expect(result.output).toContain('j22: its set page answered HTTP 429 twice');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Set sections failed for j22, lea, pip, who.');
    expect(j22.sections.map(shown)).toEqual([{ name: 'Stored cards', collector_numbers: ['27'] }]);
  });
});

describe('set section import access', () => {
  test.each([
    ['a signed-in user', () => user.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot list the sets for the set sections import', async (_caller, client) => {
    const { error } = await client().rpc('sets_for_set_section_import');

    expect(error?.code).toBe('42501');
  });
});
