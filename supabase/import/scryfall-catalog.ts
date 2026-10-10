import type { Database } from '../database.types';
import type { ImportAdapter, StagedRow } from './import-run';
import {
  type BulkFile,
  type ScryfallCard,
  type ScryfallFace,
  isCatalogLayout,
  isPaperPrinting,
  readBulkFiles,
  readCards,
} from './scryfall-bulk-data';

type CommanderLegality = Database['public']['Enums']['commander_legality'];

const colorOrder = ['W', 'U', 'B', 'R', 'G'];

type BulkData = Record<'oracle_cards' | 'default_cards', BulkFile>;

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

async function* catalogRows(bulkData: BulkData): AsyncGenerator<StagedRow> {
  for await (const card of readCards(bulkData.oracle_cards)) {
    if (isCatalogLayout(card)) {
      yield* cardRows(card);
    }
  }
  for await (const card of readCards(bulkData.default_cards)) {
    if (isCatalogLayout(card) && isPaperPrinting(card)) {
      yield printingRow(card);
    }
  }
}

export async function scryfallCatalog(manifestLocation: string): Promise<ImportAdapter> {
  const bulkData: BulkData = await readBulkFiles(manifestLocation, ['oracle_cards', 'default_cards']);
  const fileTimes = [bulkData.oracle_cards.updated_at, bulkData.default_cards.updated_at].map(
    (time) => new Date(time),
  );
  return {
    source: 'catalog',
    sourceUpdatedAt: new Date(Math.min(...fileTimes.map((time) => time.getTime()))),
    rows: () => catalogRows(bulkData),
  };
}
