import { z } from 'zod';

import type { Database } from '../database.types';
import { ImportFailed, type ImportClient } from './import-run';
import { scryfallHeaders } from './scryfall-bulk-data';
import { importUserAgent } from './source-file';

export const scryfallSiteUrl = 'https://scryfall.com';
export const scryfallApiUrl = 'https://api.scryfall.com';

type ScryfallUrls = { site: string; api: string };

const pageSection = z.strictObject({ name: z.string(), search: z.string() });

type PageSection = z.infer<typeof pageSection>;

const storedPageSections = z.array(pageSection);

export type ImportedSetSection = PageSection & { card_printing_ids: string[] };

type ListedSet = Database['public']['Functions']['sets_for_set_section_import']['Returns'][number];

type SearchPage = { data?: { id?: string }[]; has_more?: boolean; next_page?: string };

type ScryfallError = { code?: string };

type SectionHeader = { name: string; href: string | null; nameEnded: boolean };

type SetPage = { hasCardGrid: boolean; headers: SectionHeader[] };

type RequestKind = 'set page' | 'card search';

const requestSpacingMs = 1000;

const tooManyRequests = 429;

const rateLimitedRetries = 3;

const htmlHeaders = { 'User-Agent': importUserAgent, Accept: 'text/html' };

async function readSetPage(page: Response): Promise<SetPage> {
  const setPage: SetPage = { hasCardGrid: false, headers: [] };
  const { headers } = setPage;
  await new HTMLRewriter()
    .on('.card-grid', {
      element() {
        setPage.hasCardGrid = true;
      },
    })
    .on('h2.card-grid-header', {
      element() {
        headers.push({ name: '', href: null, nameEnded: false });
      },
      text(chunk) {
        const header = headers.at(-1)!;
        if (!header.nameEnded) {
          header.name += chunk.text;
        }
      },
    })
    .on('h2.card-grid-header .card-grid-header-dot', {
      element() {
        headers.at(-1)!.nameEnded = true;
      },
    })
    .on('h2.card-grid-header a[href]', {
      element(link) {
        headers.at(-1)!.href = link.getAttribute('href')!.replaceAll('&amp;', '&');
      },
    })
    .transform(page)
    .text();
  return setPage;
}

class ScryfallReader {
  searches = 0;
  private readonly nextRequestAt: Record<RequestKind, number> = { 'set page': 0, 'card search': 0 };

  constructor(
    private readonly urls: ScryfallUrls,
    private readonly retryWaitMs: number,
  ) {}

  async runSearches(pageSections: PageSection[]): Promise<ImportedSetSection[]> {
    const sections: ImportedSetSection[] = [];
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
    const { hasCardGrid, headers } = await readSetPage(response);
    if (!hasCardGrid) {
      throw new Error(`${description} has no card grid`);
    }
    return headers.flatMap((header) => {
      const search = header.href === null ? null : new URL(header.href, this.urls.site).searchParams.get('q');
      return search ? [{ name: header.name.replace(/\s+/g, ' ').trim(), search }] : [];
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
    let response = await this.send(kind, url, headers);
    for (let retry = 1; response.status === tooManyRequests && retry <= rateLimitedRetries; retry += 1) {
      await Bun.sleep(this.retryWaitMs);
      response = await this.send(kind, url, headers);
    }
    if (response.status === tooManyRequests) {
      throw new Error(`${description} answered HTTP 429 ${rateLimitedRetries + 1} times`);
    }
    return response;
  }

  private async send(kind: RequestKind, url: URL | string, headers: Record<string, string>): Promise<Response> {
    await Bun.sleep(Math.max(0, this.nextRequestAt[kind] - Date.now()));
    this.nextRequestAt[kind] = Date.now() + requestSpacingMs;
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
    !set.has_unlisted_card_printing && samePageSections(pageSections, storedPageSections.parse(set.sections))
      ? await client.rpc('record_set_sections_read', { set_code: set.code })
      : await client.rpc('import_set_sections', { set_code: set.code, sections: await scryfall.runSearches(pageSections) });
  if (stored.error) {
    throw new Error(stored.error.message);
  }
}

export async function importSetSections(client: ImportClient, urls: ScryfallUrls, retryWaitSeconds: number): Promise<void> {
  const { data: sets, error } = await client.rpc('sets_for_set_section_import');
  if (error) {
    throw new ImportFailed(`Set sections: ${error.message}`);
  }
  const scryfall = new ScryfallReader(urls, retryWaitSeconds * 1000);
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
