import type { Database } from '../database.types';
import { ImportFailed, type ImportClient } from './import-run';
import { scryfallHeaders } from './scryfall-bulk-data';
import { importUserAgent } from './source-file';

export const scryfallSiteUrl = 'https://scryfall.com';
export const scryfallApiUrl = 'https://api.scryfall.com';

type ScryfallUrls = { site: string; api: string };

type PageSection = { name: string; search: string };

type SetSection = PageSection & { card_printing_ids: string[] };

type ListedSet = Database['public']['Functions']['sets_for_set_section_import']['Returns'][number];

type SearchPage = { data?: { id?: string }[]; has_more?: boolean; next_page?: string };

type ScryfallError = { code?: string };

type SectionHeader = { name: string; href: string | null; nameRead: boolean };

type RequestKind = 'set page' | 'card search';

const requestSpacingMs: Record<RequestKind, number> = { 'set page': 1000, 'card search': 500 };

const tooManyRequests = 429;

const rateLimitedWaitMs = 30_000;

const htmlHeaders = { 'User-Agent': importUserAgent, Accept: 'text/html' };

async function sectionHeaders(page: Response): Promise<SectionHeader[]> {
  const headers: SectionHeader[] = [];
  await new HTMLRewriter()
    .on('h2.card-grid-header', {
      element() {
        headers.push({ name: '', href: null, nameRead: false });
      },
      text(chunk) {
        const header = headers.at(-1)!;
        if (!header.nameRead) {
          header.name += chunk.text;
        }
      },
    })
    .on('h2.card-grid-header .card-grid-header-dot', {
      element() {
        headers.at(-1)!.nameRead = true;
      },
    })
    .on('h2.card-grid-header a[href]', {
      element(link) {
        headers.at(-1)!.href = link.getAttribute('href')!.replaceAll('&amp;', '&');
      },
    })
    .transform(page)
    .text();
  return headers;
}

class ScryfallReader {
  searches = 0;
  private readonly nextRequestAt: Record<RequestKind, number> = { 'set page': 0, 'card search': 0 };

  constructor(private readonly urls: ScryfallUrls) {}

  async withCardPrintings(pageSections: PageSection[]): Promise<SetSection[]> {
    const sections: SetSection[] = [];
    for (const { name, search } of pageSections) {
      sections.push({ name, search, card_printing_ids: await this.cardPrintingIds(search) });
    }
    return sections;
  }

  async setPageSections(code: string): Promise<PageSection[]> {
    const description = 'its set page';
    const response = await this.get('set page', description, new URL(`/sets/${code}`, this.urls.site), htmlHeaders);
    if (!response.ok) {
      throw new Error(`${description} answered HTTP ${response.status}`);
    }
    const headers = await sectionHeaders(response);
    if (headers.length === 0) {
      throw new Error(`${description} has no set section headers`);
    }
    return headers.map((header) => {
      const name = header.name.replace(/\s+/g, ' ').trim();
      const search = header.href === null ? null : new URL(header.href, this.urls.site).searchParams.get('q');
      if (!search) {
        throw new Error(`the set section header "${name}" has no search link`);
      }
      return { name, search };
    });
  }

  private async cardPrintingIds(search: string): Promise<string[]> {
    this.searches += 1;
    const description = `the search "${search}"`;
    const ids: string[] = [];
    const firstPage = new URL('/cards/search', this.urls.api);
    firstPage.search = new URLSearchParams({ q: search, unique: 'prints' }).toString();
    for (let url: string | undefined = firstPage.toString(); url; ) {
      const response = await this.get('card search', description, url, scryfallHeaders);
      if (response.status === 404 && ((await response.json()) as ScryfallError).code === 'not_found') {
        return ids;
      }
      if (!response.ok) {
        throw new Error(`${description} answered HTTP ${response.status}`);
      }
      const page = (await response.json()) as SearchPage;
      ids.push(...(page.data ?? []).map((card) => card.id!));
      url = page.has_more ? page.next_page : undefined;
    }
    return ids;
  }

  private async get(kind: RequestKind, description: string, url: URL | string, headers: Record<string, string>) {
    const first = await this.send(kind, url, headers);
    if (first.status !== tooManyRequests) {
      return first;
    }
    await Bun.sleep(rateLimitedWaitMs);
    const second = await this.send(kind, url, headers);
    if (second.status === tooManyRequests) {
      throw new Error(`${description} answered HTTP 429 twice`);
    }
    return second;
  }

  private async send(kind: RequestKind, url: URL | string, headers: Record<string, string>): Promise<Response> {
    await Bun.sleep(Math.max(0, this.nextRequestAt[kind] - Date.now()));
    this.nextRequestAt[kind] = Date.now() + requestSpacingMs[kind];
    return fetch(url, { headers });
  }
}

function samePageSections(page: PageSection[], stored: PageSection[]) {
  return (
    page.length === stored.length &&
    page.every((section, index) => section.name === stored[index]!.name && section.search === stored[index]!.search)
  );
}

async function storeSetSections(client: ImportClient, scryfall: ScryfallReader, set: ListedSet) {
  const pageSections = await scryfall.setPageSections(set.code);
  const stored =
    !set.has_unlisted_card_printing && samePageSections(pageSections, set.sections as PageSection[])
      ? await client.rpc('record_set_sections_read', { set_code: set.code })
      : await client.rpc('import_set_sections', { set_code: set.code, sections: await scryfall.withCardPrintings(pageSections) });
  if (stored.error) {
    throw new Error(stored.error.message);
  }
}

export async function importSetSections(client: ImportClient, urls: ScryfallUrls): Promise<void> {
  const { data: sets, error } = await client.rpc('sets_for_set_section_import');
  if (error) {
    throw new ImportFailed(`Set sections: ${error.message}`);
  }
  const scryfall = new ScryfallReader(urls);
  const dueSets = sets.filter((set) => set.due);
  const failedSets: string[] = [];
  for (const set of dueSets) {
    try {
      await storeSetSections(client, scryfall, set);
    } catch (error) {
      failedSets.push(set.code);
      console.error(`Could not read the set sections of ${set.code}: ${(error as Error).message}`);
    }
  }
  console.log(
    `Set sections: ${dueSets.length - failedSets.length} sets read, ${sets.length - dueSets.length} skipped, ${failedSets.length} failed, ${scryfall.searches} searches run.`,
  );
  if (failedSets.length > 0) {
    throw new ImportFailed(`Set sections failed for ${failedSets.join(', ')}.`);
  }
}
