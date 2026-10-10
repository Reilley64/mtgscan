import type { ImportClient } from '../import/import-run';
import type { CatalogQuery, Color, PriceCurrency, Rarity } from '../search';

type CardFacts = {
  oracle_id: string;
  name: string;
  type_line: string;
  colors: string[];
  color_identity: string[];
  mana_value: number;
  keywords: string[];
  can_be_commander: boolean;
  is_game_changer: boolean | null;
  faces: { power: string | null; toughness: string | null }[];
  printings: { set_code: string; rarity: Rarity }[];
  lowest_prices: Partial<Record<PriceCurrency, number>>;
  tag_ids: Set<string>;
};

type TagClosures = Map<string, Set<string>>;

type ChipCheck = (query: CatalogQuery, card: CardFacts, closures: TagClosures) => boolean;

const pageRows = 1000;
const idsPerRequest = 100;
const numericStat = /^-?[0-9]+(\.[0-9]+)?$/;

function nameKey(value: string): string {
  return value
    .split(/\s*\/\/\s*/)
    .map((face) =>
      face
        .toLowerCase()
        .replaceAll('æ', 'ae')
        .replaceAll('œ', 'oe')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ''),
    )
    .join('/');
}

function typeWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

function hasType(card: CardFacts, type: string): boolean {
  const words = typeWords(type);
  return card.type_line.split(' // ').some((face) => {
    const faceWords = typeWords(face);
    return words.every((word) => faceWords.includes(word));
  });
}

function hasColor(card: CardFacts, color: Color | 'C'): boolean {
  return color === 'C' ? card.colors.length === 0 : card.colors.includes(color);
}

function statWithin(card: CardFacts, stat: 'power' | 'toughness', min = -Infinity, max = Infinity): boolean {
  return card.faces.some((face) => {
    const value = face[stat];
    return value !== null && numericStat.test(value) && Number(value) >= min && Number(value) <= max;
  });
}

function priceWithin(query: CatalogQuery, card: CardFacts): boolean {
  const cents = card.lowest_prices[query.price_currency ?? 'USD'];
  const min = query.price_min === undefined ? 0 : Math.round(Number(query.price_min) * 100);
  const max = query.price_max === undefined ? Infinity : Math.round(Number(query.price_max) * 100);
  return cents !== undefined && cents >= min && cents <= max;
}

function keywordKeys(card: CardFacts): string[] {
  return card.keywords.map((keyword) => keyword.toLowerCase());
}

function hasTag(card: CardFacts, closures: TagClosures, slug: string): boolean {
  return [...(closures.get(slug.toLowerCase()) ?? [])].some((tagId) => card.tag_ids.has(tagId));
}

function inSet(card: CardFacts, set: string): boolean {
  return card.printings.some((printing) => printing.set_code === set.toLowerCase());
}

function ofRarity(card: CardFacts, rarity: Rarity): boolean {
  return card.printings.some((printing) => printing.rarity === rarity);
}

const chipChecks: Partial<Record<keyof CatalogQuery, ChipCheck>> = {
  names: (query, card) => (query.names ?? []).every((name) => nameKey(card.name).includes(nameKey(name))),
  names_exclude: (query, card) =>
    !(query.names_exclude ?? []).some((name) => nameKey(card.name).includes(nameKey(name))),
  types: (query, card) => (query.types ?? []).every((type) => hasType(card, type)),
  types_exclude: (query, card) => !(query.types_exclude ?? []).some((type) => hasType(card, type)),
  colors: (query, card) => (query.colors ?? []).every((color) => hasColor(card, color)),
  colors_exclude: (query, card) => !(query.colors_exclude ?? []).some((color) => hasColor(card, color)),
  identity_subset_of: (query, card) =>
    card.color_identity.every((color) => (query.identity_subset_of as string[]).includes(color)),
  mana_value_min: (query, card) => card.mana_value >= query.mana_value_min!,
  mana_value_max: (query, card) => card.mana_value <= query.mana_value_max!,
  power_min: (query, card) => statWithin(card, 'power', query.power_min, query.power_max),
  power_max: (query, card) => statWithin(card, 'power', query.power_min, query.power_max),
  toughness_min: (query, card) => statWithin(card, 'toughness', query.toughness_min, query.toughness_max),
  toughness_max: (query, card) => statWithin(card, 'toughness', query.toughness_min, query.toughness_max),
  price_min: priceWithin,
  price_max: priceWithin,
  keywords: (query, card) => (query.keywords ?? []).every((keyword) => keywordKeys(card).includes(keyword.toLowerCase())),
  keywords_exclude: (query, card) =>
    !(query.keywords_exclude ?? []).some((keyword) => keywordKeys(card).includes(keyword.toLowerCase())),
  sets: (query, card) => (query.sets ?? []).every((set) => inSet(card, set)),
  sets_exclude: (query, card) => !(query.sets_exclude ?? []).some((set) => inSet(card, set)),
  rarities: (query, card) => (query.rarities ?? []).every((rarity) => ofRarity(card, rarity)),
  rarities_exclude: (query, card) => !(query.rarities_exclude ?? []).some((rarity) => ofRarity(card, rarity)),
  tags: (query, card, closures) => (query.tags ?? []).every((slug) => hasTag(card, closures, slug)),
  tags_exclude: (query, card, closures) => !(query.tags_exclude ?? []).some((slug) => hasTag(card, closures, slug)),
  is_commander: (query, card) => card.can_be_commander === query.is_commander,
  is_game_changer: (query, card) => (card.is_game_changer === true) === query.is_game_changer,
};

export type ChipField = keyof typeof chipChecks;

export function violatedChips(query: CatalogQuery, card: CardFacts, closures: TagClosures): ChipField[] {
  return (Object.entries(chipChecks) as [ChipField, ChipCheck][])
    .filter(([field]) => field in query)
    .filter(([, check]) => !check(query, card, closures))
    .map(([field]) => field);
}

async function readAll<Row>(
  request: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageRows) {
    const { data, error } = await request(from, from + pageRows - 1);
    if (error) {
      throw new Error(`Could not read card details: ${error.message}`);
    }
    rows.push(...data!);
    if (data!.length < pageRows) {
      return rows;
    }
  }
}

export async function readCardFacts(client: ImportClient, oracleIds: string[]): Promise<Map<string, CardFacts>> {
  const [cards, faces, printings, prices, taggings] = await Promise.all([
    readAll((from, to) =>
      client
        .from('cards')
        .select('oracle_id, name, type_line, colors, color_identity, mana_value, keywords, can_be_commander, is_game_changer')
        .in('oracle_id', oracleIds)
        .order('oracle_id')
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from('card_faces')
        .select('oracle_id, face_index, power, toughness')
        .in('oracle_id', oracleIds)
        .order('oracle_id')
        .order('face_index')
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from('card_printings')
        .select('id, oracle_id, set_code, rarity')
        .in('oracle_id', oracleIds)
        .is('absent_since', null)
        .order('id')
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from('card_lowest_prices')
        .select('oracle_id, currency, amount_cents')
        .in('oracle_id', oracleIds)
        .order('oracle_id')
        .order('currency')
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from('card_taggings')
        .select('oracle_id, tag_id')
        .in('oracle_id', oracleIds)
        .order('oracle_id')
        .order('tag_id')
        .range(from, to),
    ),
  ]);
  const facts = new Map<string, CardFacts>(
    cards.map((card) => [
      card.oracle_id,
      { ...card, faces: [], printings: [], lowest_prices: {}, tag_ids: new Set<string>() },
    ]),
  );
  for (const face of faces) {
    facts.get(face.oracle_id)?.faces.push(face);
  }
  for (const printing of printings) {
    facts.get(printing.oracle_id)?.printings.push(printing);
  }
  for (const price of prices) {
    facts.get(price.oracle_id)!.lowest_prices[price.currency] = price.amount_cents;
  }
  for (const tagging of taggings) {
    facts.get(tagging.oracle_id)?.tag_ids.add(tagging.tag_id);
  }
  return facts;
}

function chunks<Item>(items: Item[], size: number): Item[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function disabledTagIds(client: ImportClient): Promise<Set<string>> {
  const rows = await readAll((from, to) => client.from('disabled_tags').select('tag_id').order('tag_id').range(from, to));
  return new Set(rows.map((row) => row.tag_id));
}

export async function readTagClosures(client: ImportClient, slugs: string[]): Promise<TagClosures> {
  const closures: TagClosures = new Map();
  if (slugs.length === 0) {
    return closures;
  }
  const disabled = await disabledTagIds(client);
  for (const slug of new Set(slugs.map((value) => value.toLowerCase()))) {
    const roots = await readAll((from, to) =>
      client.from('oracle_tags').select('id').eq('slug', slug).order('id').range(from, to),
    );
    const closure = new Set(roots.map((root) => root.id).filter((id) => !disabled.has(id)));
    let frontier = [...closure];
    while (frontier.length > 0) {
      const edges = (
        await Promise.all(
          chunks(frontier, idsPerRequest).map((parents) =>
            readAll((from, to) =>
              client.from('tag_edges').select('child_id').in('parent_id', parents).order('child_id').range(from, to),
            ),
          ),
        )
      ).flat();
      frontier = [...new Set(edges.map((edge) => edge.child_id))].filter((id) => !disabled.has(id) && !closure.has(id));
      frontier.forEach((id) => closure.add(id));
    }
    closures.set(slug, closure);
  }
  return closures;
}
