import type { DeckCard } from '@mtgscan/supabase/decks';

import { sortChoices, type SortOrder } from '@/lib/sort-order';

export type DeckGrouping = 'type' | 'mana_value' | 'color' | 'rarity' | 'none';

type DeckSort = 'name' | 'mana_value' | 'price' | 'added';

export type DeckOrder = SortOrder<DeckSort>;

type DeckGroup = {
  title: string;
  cards: DeckCard[];
};

type GroupingRule = {
  title: string;
  groups: readonly string[];
  groupOf: (card: DeckCard) => string;
};

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

const colorGroups: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

const rarityGroups: Record<DeckCard['rarity'], string> = {
  mythic: 'Mythic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  special: 'Special',
  bonus: 'Special',
};

const highestManaValueGroup = 7;

function typeGroupOf(card: DeckCard) {
  const words = card.type_line.split(/[^A-Za-z]+/);
  return typeGroups.find(({ type }) => words.includes(type))?.title ?? landsGroup;
}

function manaValueGroupOf(card: DeckCard) {
  if (typeGroupOf(card) === landsGroup) {
    return landsGroup;
  }
  const manaValue = Math.floor(card.mana_value);
  return manaValue >= highestManaValueGroup ? `${highestManaValueGroup}+` : `${manaValue}`;
}

function colorGroupOf(card: DeckCard) {
  if (card.colors.length > 1) {
    return 'Multicolor';
  }
  return card.colors.length === 1 ? colorGroups[card.colors[0]] : 'Colorless';
}

const groupingRules: Record<DeckGrouping, GroupingRule> = {
  type: { title: 'Type', groups: typeGroups.map(({ title }) => title), groupOf: typeGroupOf },
  mana_value: {
    title: 'Mana value',
    groups: [...Array.from({ length: highestManaValueGroup }, (_, manaValue) => `${manaValue}`), `${highestManaValueGroup}+`, landsGroup],
    groupOf: manaValueGroupOf,
  },
  color: { title: 'Color', groups: [...Object.values(colorGroups), 'Multicolor', 'Colorless'], groupOf: colorGroupOf },
  rarity: { title: 'Rarity', groups: [...new Set(Object.values(rarityGroups))], groupOf: (card) => rarityGroups[card.rarity] },
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

function byName(a: DeckCard, b: DeckCard) {
  return a.name.localeCompare(b.name) || a.copy_id.localeCompare(b.copy_id);
}

function priceOf(card: DeckCard) {
  return card.price ? Number(card.price.amount) : 0;
}

const sortRules: Record<DeckSort, (a: DeckCard, b: DeckCard) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  mana_value: (a, b) => a.mana_value - b.mana_value,
  price: (a, b) => priceOf(a) - priceOf(b),
  added: (a, b) => a.added_at.localeCompare(b.added_at),
};

function noPriceLast(a: DeckCard, b: DeckCard) {
  return Number(a.price === null) - Number(b.price === null);
}

function sortedCards(cards: DeckCard[], { sort, direction }: DeckOrder) {
  const sign = direction === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => (sort === 'price' ? noPriceLast(a, b) : 0) || sign * sortRules[sort](a, b) || byName(a, b));
}

export function deckCommanders(cards: DeckCard[]) {
  return cards
    .filter((card) => card.role === 'commander')
    .sort((a, b) => a.commander_at!.localeCompare(b.commander_at!) || byName(a, b));
}

export function mainDeckGroups(cards: DeckCard[], grouping: DeckGrouping, order: DeckOrder): DeckGroup[] {
  const { groups, groupOf } = groupingRules[grouping];
  const mainDeckCards = sortedCards(
    cards.filter((card) => card.role === 'main'),
    order,
  );
  return groups
    .map((title) => ({ title, cards: mainDeckCards.filter((card) => groupOf(card) === title) }))
    .filter((group) => group.cards.length > 0);
}
