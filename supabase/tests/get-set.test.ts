import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { readSearchError } from '../search';
import type { SetDetails } from '../sets';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';
import { artCrop } from './scryfall-images';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

const roilCartographer = '84317f9d-5a24-4f74-9c3e-0a8b5c15bb5f';
const scurrilousSentry = '29e2805f-59fa-4a6d-97bc-266191b2aa8d';
const roilCartographerVariant = '7b9b743b-340d-4a15-a71d-d3108adbdc45';
const snowCoveredWastes = '87870792-e429-4eba-8193-cdce5c7b6c55';
const inspirit = '46900ec7-eb18-45c4-8e90-a48b665cfdee';
const wastes = 'baf8f4f2-9f25-4cd2-8d78-1041e134aeac';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const urbanDaggertooth = '4ab83a39-d90d-403e-b74d-fe99c8b2aacd';
const prismaticPiper = 'c78c2713-39e7-4a6e-a132-027099a89665';
const smotheringTitheVariant = '2309fb66-3aa0-4ec5-9a8e-5a0caa19c270';
const boonOfTheSpiritRealm = 'a588fc39-ed88-4262-96cd-908fadc7f049';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';

function normalImage(printingId: string, version: number) {
  return `https://cards.scryfall.io/normal/front/${printingId[0]}/${printingId[1]}/${printingId}.jpg?${version}`;
}

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function readSet(user: TestUser, query: unknown) {
  return user.client.rpc('get_set', { query: query as { code: string } });
}

async function setNamed(user: TestUser, code: string) {
  const { data, error } = await readSet(user, { code });
  expect(error).toBeNull();
  return data as unknown as SetDetails;
}

async function refusal(user: TestUser, query: unknown) {
  const { data, error } = await readSet(user, query);
  expect(data).toBeNull();
  return readSearchError(error!);
}

describe('the set read', () => {
  test('a set with booster cards comes with its main set and its variants, each card printing with its count in each finish view', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(roilCartographer, { copies: 2 }), stack(roilCartographer, { finish: 'foil' }), stack(roilCartographerVariant, { finish: 'foil' })]),
    );

    expect(await setNamed(user, 'mh3')).toEqual({
      code: 'mh3',
      name: 'Modern Horizons 3',
      icon_svg_uri: 'https://svgs.scryfall.io/sets/mh3.svg?1791777600',
      released_at: '2024-06-14',
      set_art_uri: artCrop(roilCartographer, 1783911289),
      completion: { any: { owned: 1, size: 2 }, nonfoil: { owned: 1, size: 2 }, foil: { owned: 1, size: 2 } },
      main_set: [
        {
          printing_id: roilCartographer,
          name: 'Roil Cartographer',
          collector_number: '67',
          image_uri: normalImage(roilCartographer, 1783911289),
          finishes: ['nonfoil', 'foil'],
          counts: { any: 3, nonfoil: 2, foil: 1 },
        },
        {
          printing_id: scurrilousSentry,
          name: 'Scurrilous Sentry',
          collector_number: '108',
          image_uri: normalImage(scurrilousSentry, 1783911276),
          finishes: ['nonfoil', 'foil'],
          counts: { any: 0, nonfoil: 0, foil: 0 },
        },
      ],
      variants: {
        completion: { any: { owned: 1, size: 1 }, nonfoil: { owned: 1, size: 1 }, foil: { owned: 1, size: 1 } },
        card_printings: [
          {
            printing_id: roilCartographerVariant,
            name: 'Roil Cartographer',
            collector_number: '511',
            image_uri: normalImage(roilCartographerVariant, 1783911138),
            finishes: ['foil'],
            counts: { any: 1, nonfoil: 1, foil: 1 },
          },
        ],
      },
    });
  });

  test('basic lands are in neither the main set nor the variants', async () => {
    const user = await signUpNewUser();
    await seedCopies(user, [{ card_printing_id: snowCoveredWastes }, { card_printing_id: wastes }]);

    const mh3 = await setNamed(user, 'mh3');
    const eoc = await setNamed(user, 'eoc');

    expect(mh3.main_set.map((printing) => printing.collector_number)).toEqual(['67', '108']);
    expect(mh3.variants.card_printings.map((printing) => printing.collector_number)).toEqual(['511']);
    expect(eoc.main_set.map((printing) => printing.printing_id)).toEqual([inspirit]);
    expect(eoc.variants).toEqual({
      completion: { any: { owned: 0, size: 0 }, nonfoil: { owned: 0, size: 0 }, foil: { owned: 0, size: 0 } },
      card_printings: [],
    });
  });

  test('card printings come in collector number order, by their leading digits and then as text', async () => {
    const user = await signUpNewUser();

    const sld = await setNamed(user, 'sld');
    const pfra = await setNamed(user, 'pfra');
    const cmm = await setNamed(user, 'cmm');

    expect(sld.main_set.map((printing) => printing.collector_number)).toEqual([
      '453', '478', '620', '722', '1144', '1168', '1335', '1336', '1336b', '1417', '1510',
      '1556', '1659', '1880', '2197', '2281', '2367', '2407', '2667', '7009', '7103',
    ]);
    expect(pfra.main_set.map((printing) => printing.collector_number)).toEqual(['57p', '116p']);
    expect(cmm.main_set.map((printing) => printing.collector_number)).toEqual(['1', '79', '131']);
    expect(cmm.variants.card_printings.map((printing) => printing.collector_number)).toEqual(['473', '500', '543', '720', '753', '878']);
  });

  test("one user never sees another user's copies", async () => {
    const owner = await signUpNewUser();
    const other = await signUpNewUser();
    await committed(owner, scanBatch([stack(roilCartographer, { copies: 2 }), stack(roilCartographerVariant, { finish: 'foil' })]));

    const ownersSet = await setNamed(owner, 'mh3');
    const othersSet = await setNamed(other, 'mh3');

    expect(ownersSet.main_set[0]!.counts).toEqual({ any: 2, nonfoil: 2, foil: 0 });
    expect(othersSet.main_set[0]!.counts).toEqual({ any: 0, nonfoil: 0, foil: 0 });
    expect(othersSet.completion.any).toEqual({ owned: 0, size: 2 });
    expect(othersSet.variants.completion.any).toEqual({ owned: 0, size: 1 });
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read a set', async (_, client) => {
    const { data, error } = await client().rpc('get_set', { query: { code: 'mh3' } });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

describe('the counts in each finish view', () => {
  function countsOf(set: SetDetails, printingId: string) {
    return [...set.main_set, ...set.variants.card_printings].find((printing) => printing.printing_id === printingId)!.counts;
  }

  test('Nonfoil counts the nonfoil copies, and Foil counts the foil and etched copies', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(angelicCurator, { copies: 2 }), stack(angelicCurator, { finish: 'foil' }), stack(angelicCurator, { finish: 'etched', copies: 2 })]),
    );

    const mh2 = await setNamed(user, 'mh2');

    expect(countsOf(mh2, angelicCurator)).toEqual({ any: 5, nonfoil: 2, foil: 3 });
    expect(countsOf(mh2, urbanDaggertooth)).toEqual({ any: 0, nonfoil: 0, foil: 0 });
    expect(mh2.completion).toEqual({ any: { owned: 1, size: 2 }, nonfoil: { owned: 1, size: 2 }, foil: { owned: 1, size: 2 } });
  });

  test('a foil-only or etched-only card printing counts every copy in Nonfoil', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(roilCartographerVariant, { finish: 'foil', copies: 2 }), stack(smotheringTitheVariant, { finish: 'etched' })]));

    const mh3 = await setNamed(user, 'mh3');
    const cmm = await setNamed(user, 'cmm');

    expect(countsOf(mh3, roilCartographerVariant)).toEqual({ any: 2, nonfoil: 2, foil: 2 });
    expect(countsOf(cmm, smotheringTitheVariant)).toEqual({ any: 1, nonfoil: 1, foil: 1 });
  });

  test('a nonfoil-only card printing has no Foil count and leaves the Foil size', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(prismaticPiper, { copies: 2 }), stack(boonOfTheSpiritRealm)]));

    const cmm = await setNamed(user, 'cmm');

    expect(countsOf(cmm, prismaticPiper)).toEqual({ any: 2, nonfoil: 2, foil: null });
    expect(countsOf(cmm, boonOfTheSpiritRealm)).toEqual({ any: 1, nonfoil: 1, foil: null });
    expect(cmm.completion).toEqual({ any: { owned: 1, size: 3 }, nonfoil: { owned: 1, size: 3 }, foil: { owned: 0, size: 2 } });
    expect(cmm.variants.completion).toEqual({ any: { owned: 1, size: 6 }, nonfoil: { owned: 1, size: 6 }, foil: { owned: 0, size: 4 } });
  });

  test('a set with no foil card printing has an empty main set in Foil', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(counterspell)]));

    const lea = await setNamed(user, 'lea');

    expect(countsOf(lea, counterspell)).toEqual({ any: 1, nonfoil: 1, foil: null });
    expect(lea.completion).toEqual({ any: { owned: 1, size: 5 }, nonfoil: { owned: 1, size: 5 }, foil: { owned: 0, size: 0 } });
  });
});

describe('refused set reads', () => {
  const mh3ReleasedAt = '2024-06-14';

  afterEach(async () => {
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = ${mh3ReleasedAt} where code = 'mh3'`);
  });

  test('an unknown set code is not found', async () => {
    const user = await signUpNewUser();

    expect(await refusal(user, { code: 'zzz' })).toMatchObject({ code: 'not_found', field: 'code' });
  });

  test('a set with no card printing in the card catalog is not found', async () => {
    const user = await signUpNewUser();

    expect(await refusal(user, { code: 't40k' })).toMatchObject({ code: 'not_found', field: 'code' });
  });

  test('a set released tomorrow or with no release date is not found, and a set released today is found', async () => {
    const user = await signUpNewUser();

    await asDatabaseOwner((database) => database`update public.card_sets set released_at = current_date + 1 where code = 'mh3'`);
    const releasedTomorrow = await refusal(user, { code: 'mh3' });
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = null where code = 'mh3'`);
    const noReleaseDate = await refusal(user, { code: 'mh3' });
    await asDatabaseOwner((database) => database`update public.card_sets set released_at = current_date where code = 'mh3'`);
    const releasedToday = await setNamed(user, 'mh3');

    expect(releasedTomorrow).toMatchObject({ code: 'not_found', field: 'code' });
    expect(noReleaseDate).toMatchObject({ code: 'not_found', field: 'code' });
    expect(releasedToday.code).toBe('mh3');
  });

  test.each([
    ['a query that is not an object', ['mh3'], null],
    ['a query with no code', {}, 'code'],
    ['a code that is not a string', { code: 3 }, 'code'],
    ['an empty code', { code: '' }, 'code'],
    ['an unknown field', { code: 'mh3', finish: 'foil' }, 'finish'],
  ])('%s is refused as an invalid argument', async (_, query, field) => {
    const user = await signUpNewUser();

    expect(await refusal(user, query)).toMatchObject({ code: 'invalid_argument', field });
  });
});
