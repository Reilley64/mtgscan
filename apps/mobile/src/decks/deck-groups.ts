import type { DeckBasicLand, DeckCard } from '@mtgscan/supabase/decks';

import { colorNames } from '@/decks/deck-labels';
import { sortChoices, type SortOrder } from '@/lib/sort-order';

export type DeckGrouping = 'type' | 'mana_value' | 'color' | 'rarity' | 'none';

type DeckSort = 'name' | 'mana_value' | 'price' | 'added';

export type DeckOrder = SortOrder<DeckSort>;

export type BasicLandTile = {
  key: string;
  oracle_id: string;
  name: string;
  image_uris: string[];
};

export type MainDeckCard = DeckCard | BasicLandTile;

type DeckGroup = {
  title: string;
  cards: MainDeckCard[];
};

type GroupingRule = {
  title: string;
  groups: readonly string[];
  groupOf: (card: MainDeckCard) => string;
};

export function isBasicLandTile(card: MainDeckCard): card is BasicLandTile {
  return !('copy_id' in card);
}

function basicLandTiles(lands: DeckBasicLand[]): BasicLandTile[] {
  return lands.flatMap(({ oracle_id, name, image_uris, count }) =>
    oracle_id === null ? [] : Array.from({ length: count }, (_, index) => ({ key: `${oracle_id}:${index}`, oracle_id, name, image_uris })),
  );
}

const typeGroups = [
  { title: 'Creatures', type: 'Creature' },
  { title: 'Planeswalkers', type: 'Planeswalker' },
  { title: 'Battles', type: 'Battle' },
  { title: 'Artifacts', type: 'Artifact' },
  { title: 'Enchantments', type: 'Enchantment' },
  { title: 'Instants', type: 'Instant' },
  { title: 'Sorceries', type: 'Sorcery' },
  { title: 'Lands', type: 'Land' },
] as const;

const landsGroup = typeGroups[typeGroups.length - 1].title;

const mainDeckGroup = 'Main deck';

const rarityGroups: Record<DeckCard['rarity'], string> = {
  mythic: 'Mythic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  special: 'Special',
  bonus: 'Special',
};

const highestManaValueGroup = 7;

function typeGroupOf(card: MainDeckCard) {
  if (isBasicLandTile(card)) {
    return landsGroup;
  }
  const words = card.type_line.split(/[^A-Za-z]+/);
  return typeGroups.find(({ type }) => words.includes(type))?.title ?? landsGroup;
}

function manaValueGroupOf(card: MainDeckCard) {
  if (isBasicLandTile(card) || typeGroupOf(card) === landsGroup) {
    return landsGroup;
  }
  const manaValue = Math.floor(card.mana_value);
  return manaValue >= highestManaValueGroup ? `${highestManaValueGroup}+` : `${manaValue}`;
}

function colorGroupOf(card: MainDeckCard) {
  if (isBasicLandTile(card)) {
    return 'Colorless';
  }
  if (card.colors.length > 1) {
    return 'Multicolor';
  }
  return card.colors.length === 1 ? colorNames[card.colors[0]] : 'Colorless';
}

const groupingRules: Record<DeckGrouping, GroupingRule> = {
  type: { title: 'Type', groups: typeGroups.map(({ title }) => title), groupOf: typeGroupOf },
  mana_value: {
    title: 'Mana value',
    groups: [...Array.from({ length: highestManaValueGroup }, (_, manaValue) => `${manaValue}`), `${highestManaValueGroup}+`, landsGroup],
    groupOf: manaValueGroupOf,
  },
  color: { title: 'Color', groups: [...Object.values(colorNames), 'Multicolor', 'Colorless'], groupOf: colorGroupOf },
  rarity: {
    title: 'Rarity',
    groups: [...new Set(Object.values(rarityGroups))],
    groupOf: (card) => rarityGroups[isBasicLandTile(card) ? 'common' : card.rarity],
  },
  none: { title: 'None', groups: [mainDeckGroup], groupOf: () => mainDeckGroup },
};

export const defaultDeckGrouping: DeckGrouping = 'type';

export const defaultDeckOrder: DeckOrder = { sort: 'name', direction: 'asc' };

export const deckGroupings = (Object.entries(groupingRules) as [DeckGrouping, GroupingRule][]).map(([grouping, { title }]) => ({
  grouping,
  title,
}));

export const deckSorts = sortChoices<DeckSort>(['name', 'mana_value', 'price', 'added']);

export function isDefaultDeckOrder(order: DeckOrder) {
  return order.sort === defaultDeckOrder.sort && order.direction === defaultDeckOrder.direction;
}

function keyOf(card: MainDeckCard) {
  return isBasicLandTile(card) ? card.key : card.copy_id;
}

function byName(a: MainDeckCard, b: MainDeckCard) {
  return a.name.localeCompare(b.name) || keyOf(a).localeCompare(keyOf(b));
}

function priceOf(card: MainDeckCard) {
  return !isBasicLandTile(card) && card.price ? Number(card.price.amount) : 0;
}

function manaValueOf(card: MainDeckCard) {
  return isBasicLandTile(card) ? 0 : card.mana_value;
}

function addedAtOf(card: MainDeckCard) {
  return isBasicLandTile(card) ? null : card.added_at;
}

const sortRules: Record<DeckSort, (a: MainDeckCard, b: MainDeckCard) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  mana_value: (a, b) => manaValueOf(a) - manaValueOf(b),
  price: (a, b) => priceOf(a) - priceOf(b),
  added: (a, b) => (addedAtOf(a) ?? '').localeCompare(addedAtOf(b) ?? ''),
};

const missingValueLast: Partial<Record<DeckSort, (card: MainDeckCard) => boolean>> = {
  price: (card) => isBasicLandTile(card) || card.price === null,
  added: isBasicLandTile,
};

function sortedCards(cards: MainDeckCard[], { sort, direction }: DeckOrder) {
  const sign = direction === 'asc' ? 1 : -1;
  const isMissing = missingValueLast[sort] ?? (() => false);
  return [...cards].sort((a, b) => Number(isMissing(a)) - Number(isMissing(b)) || sign * sortRules[sort](a, b) || byName(a, b));
}

export function deckCommanders(cards: DeckCard[]) {
  return cards
    .filter((card) => card.role === 'commander')
    .sort((a, b) => a.commander_at!.localeCompare(b.commander_at!) || byName(a, b));
}

export function mainDeckGroups(cards: DeckCard[], basicLands: DeckBasicLand[], grouping: DeckGrouping, order: DeckOrder): DeckGroup[] {
  const { groups, groupOf } = groupingRules[grouping];
  const mainDeckCards = sortedCards([...cards.filter((card) => card.role === 'main'), ...basicLandTiles(basicLands)], order);
  return groups
    .map((title) => ({ title, cards: mainDeckCards.filter((card) => groupOf(card) === title) }))
    .filter((group) => group.cards.length > 0);
}
