import { dirname, resolve } from 'node:path';

import type { Database } from '../database.types';
import { readGzipJsonLines } from './gzip-json-lines';
import type { ImportAdapter, StagedRow } from './import-run';

type CommanderLegality = Database['public']['Enums']['commander_legality'];

export const scryfallManifestUrl = 'https://api.scryfall.com/bulk-data';

const scryfallHeaders = {
  'User-Agent': 'mtgscan-catalog-import/0.0 (+https://github.com/Reilley64/mtgscan)',
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

const colorOrder = ['W', 'U', 'B', 'R', 'G'];

type ScryfallFace = {
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

type ScryfallCard = ScryfallFace & {
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
};

type BulkFile = {
  type: string;
  updated_at: string;
  jsonl_download_uri: string;
};

type BulkData = {
  oracleCards: BulkFile;
  defaultCards: BulkFile;
};

function isUrl(location: string): boolean {
  return /^https?:\/\//.test(location);
}

function resolveLocation(base: string, location: string): string {
  if (isUrl(location)) {
    return location;
  }
  return isUrl(base) ? new URL(location, base).toString() : resolve(dirname(base), location);
}

async function openLocation(location: string): Promise<Response> {
  const response = isUrl(location)
    ? await fetch(location, { headers: scryfallHeaders })
    : new Response(Bun.file(location));
  if (!response.ok || !response.body) {
    throw new Error(`Could not read ${location}: HTTP ${response.status}`);
  }
  return response;
}

async function readBulkData(manifestLocation: string): Promise<BulkData> {
  const manifest = (await (await openLocation(manifestLocation)).json()) as { data?: BulkFile[] };
  const find = (type: string): BulkFile => {
    const file = manifest.data?.find((entry) => entry.type === type);
    if (!file?.jsonl_download_uri || !file.updated_at) {
      throw new Error(`The Scryfall bulk data manifest has no ${type} file`);
    }
    return { ...file, jsonl_download_uri: resolveLocation(manifestLocation, file.jsonl_download_uri) };
  };
  return { oracleCards: find('oracle_cards'), defaultCards: find('default_cards') };
}

async function* readCards(file: BulkFile): AsyncGenerator<ScryfallCard> {
  const response = await openLocation(file.jsonl_download_uri);
  try {
    for await (const record of readGzipJsonLines(response.body!)) {
      yield record as ScryfallCard;
    }
  } catch (error) {
    throw new Error(`Could not read the Scryfall ${file.type} file: ${(error as Error).message}`);
  }
}

function joinFaces(card: ScryfallCard, field: 'mana_cost' | 'oracle_text'): string | null {
  return card[field] ?? card.card_faces?.map((face) => face[field] ?? '').join(' // ') ?? null;
}

function cardColors(card: ScryfallCard): string[] | null {
  if (card.colors) {
    return card.colors;
  }
  if (!card.card_faces) {
    return null;
  }
  const faceColors = new Set(card.card_faces.flatMap((face) => face.colors ?? []));
  return colorOrder.filter((color) => faceColors.has(color));
}

function commanderLegality(value: string | undefined): CommanderLegality {
  return value === 'legal' || value === 'banned' || value === 'not_legal' ? value : 'unknown';
}

function canBeCommander(frontFace: ScryfallFace): boolean {
  const [types = '', subtypes = ''] = (frontFace.type_line ?? '').split(' — ');
  const legendary = types.includes('Legendary');
  const creature = /\bCreature\b/.test(types);
  const vehicleWithBody =
    /\b(Vehicle|Spacecraft)\b/.test(subtypes) &&
    frontFace.power !== undefined &&
    frontFace.toughness !== undefined;
  const textAllowsCommander = (frontFace.oracle_text ?? '').toLowerCase().includes('can be your commander');
  return (legendary && (creature || vehicleWithBody)) || textAllowsCommander;
}

function cardRows(card: ScryfallCard): StagedRow[] {
  const faces = card.card_faces ?? [card];
  const oracleId = card.oracle_id ?? null;
  return [
    {
      target: 'cards',
      row: {
        oracle_id: oracleId,
        name: card.name ?? null,
        mana_cost: joinFaces(card, 'mana_cost'),
        mana_value: card.cmc ?? null,
        colors: cardColors(card),
        color_identity: card.color_identity ?? null,
        keywords: card.keywords ?? null,
        type_line: card.type_line ?? null,
        oracle_text: joinFaces(card, 'oracle_text'),
        edhrec_rank: card.edhrec_rank ?? null,
        commander_legality: commanderLegality(card.legalities?.commander),
        is_game_changer: card.game_changer ?? null,
        can_be_commander: canBeCommander(faces[0]!),
      },
    },
    ...faces.map((face, faceIndex) => ({
      target: 'card_faces',
      row: {
        oracle_id: oracleId,
        face_index: faceIndex,
        name: face.name ?? null,
        mana_cost: face.mana_cost ?? null,
        type_line: face.type_line ?? null,
        oracle_text: face.oracle_text ?? null,
        colors: face.colors ?? cardColors(card),
        power: face.power ?? null,
        toughness: face.toughness ?? null,
        loyalty: face.loyalty ?? null,
      },
    })),
  ];
}

function printingRow(card: ScryfallCard): StagedRow {
  const faces = card.card_faces ?? [];
  const images = card.image_uris ? [card.image_uris] : faces.map((face) => face.image_uris);
  return {
    target: 'card_printings',
    row: {
      id: card.id ?? null,
      oracle_id: card.oracle_id ?? faces[0]?.oracle_id ?? null,
      set_code: card.set ?? null,
      set_name: card.set_name ?? null,
      collector_number: card.collector_number ?? null,
      lang: card.lang ?? null,
      rarity: card.rarity ?? null,
      released_at: card.released_at ?? null,
      finishes: card.finishes ?? null,
      illustration_id: card.illustration_id ?? faces[0]?.illustration_id ?? null,
      image_uris: images.flatMap((image) => (image?.normal ? [image.normal] : [])),
    },
  };
}

function isCatalogLayout(card: ScryfallCard): boolean {
  return !layoutsOutsideTheCatalog.has(card.layout ?? '');
}

function isPaperPrinting(card: ScryfallCard): boolean {
  return card.digital !== true && (card.games ?? []).includes('paper');
}

async function* catalogRows(bulkData: BulkData): AsyncGenerator<StagedRow> {
  for await (const card of readCards(bulkData.oracleCards)) {
    if (isCatalogLayout(card)) {
      yield* cardRows(card);
    }
  }
  for await (const card of readCards(bulkData.defaultCards)) {
    if (isCatalogLayout(card) && isPaperPrinting(card)) {
      yield printingRow(card);
    }
  }
}

export async function scryfallCatalog(manifestLocation: string): Promise<ImportAdapter> {
  const bulkData = await readBulkData(manifestLocation);
  const fileTimes = [bulkData.oracleCards.updated_at, bulkData.defaultCards.updated_at].map(
    (time) => new Date(time),
  );
  return {
    source: 'catalog',
    sourceUpdatedAt: new Date(Math.min(...fileTimes.map((time) => time.getTime()))),
    rows: () => catalogRows(bulkData),
  };
}
