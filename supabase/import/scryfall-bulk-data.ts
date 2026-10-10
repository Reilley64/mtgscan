import { dirname, resolve } from 'node:path';

import { readGzipJsonLines } from './gzip-json-lines';
import { importUserAgent, isUrl, openLocation } from './source-file';

export const scryfallManifestUrl = 'https://api.scryfall.com/bulk-data';

const scryfallHeaders = {
  'User-Agent': importUserAgent,
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

const layoutsOutsideTheCatalog = new Set([
  'token',
  'double_faced_token',
  'art_series',
  'emblem',
  'planar',
  'scheme',
  'vanguard',
]);

export type ScryfallFace = {
  oracle_id?: string;
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  illustration_id?: string;
  image_uris?: { normal?: string };
};

export type ScryfallCard = ScryfallFace & {
  id?: string;
  layout?: string;
  cmc?: number;
  color_identity?: string[];
  keywords?: string[];
  legalities?: { commander?: string };
  game_changer?: boolean;
  edhrec_rank?: number;
  digital?: boolean;
  games?: string[];
  set?: string;
  set_name?: string;
  collector_number?: string;
  lang?: string;
  rarity?: string;
  released_at?: string;
  finishes?: string[];
  card_faces?: ScryfallFace[];
  prices?: Record<string, string | null | undefined>;
};

export type BulkFileType = 'oracle_cards' | 'default_cards' | 'oracle_tags';

export type BulkFile = {
  type: BulkFileType;
  updated_at: string;
  jsonl_download_uri: string;
};

function resolveLocation(base: string, location: string): string {
  if (isUrl(location)) {
    return location;
  }
  return isUrl(base) ? new URL(location, base).toString() : resolve(dirname(base), location);
}

export async function readBulkFiles<Type extends BulkFileType>(
  manifestLocation: string,
  types: Type[],
): Promise<Record<Type, BulkFile>> {
  const manifest = (await (await openLocation(manifestLocation, scryfallHeaders)).json()) as { data?: BulkFile[] };
  const files = {} as Record<Type, BulkFile>;
  for (const type of types) {
    const file = manifest.data?.find((entry) => entry.type === type);
    if (!file?.jsonl_download_uri || !file.updated_at) {
      throw new Error(`The Scryfall bulk data manifest has no ${type} file`);
    }
    files[type] = { ...file, jsonl_download_uri: resolveLocation(manifestLocation, file.jsonl_download_uri) };
  }
  return files;
}

export async function* readBulkRecords<Item>(file: BulkFile): AsyncGenerator<Item> {
  const response = await openLocation(file.jsonl_download_uri, scryfallHeaders);
  try {
    for await (const record of readGzipJsonLines(response.body!)) {
      yield record as Item;
    }
  } catch (error) {
    throw new Error(`Could not read the Scryfall ${file.type} file: ${(error as Error).message}`);
  }
}

export function readCards(file: BulkFile): AsyncGenerator<ScryfallCard> {
  return readBulkRecords<ScryfallCard>(file);
}

export function isCatalogLayout(card: ScryfallCard): boolean {
  return !layoutsOutsideTheCatalog.has(card.layout ?? '');
}

export function isPaperPrinting(card: ScryfallCard): boolean {
  return card.digital !== true && (card.games ?? []).includes('paper');
}
