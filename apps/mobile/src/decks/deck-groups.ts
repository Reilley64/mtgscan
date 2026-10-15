import type { DeckCard } from '@mtgscan/supabase/decks';

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

export type DeckGroup = {
  title: string;
  cards: DeckCard[];
};

function byName(a: DeckCard, b: DeckCard) {
  return a.name.localeCompare(b.name) || a.copy_id.localeCompare(b.copy_id);
}

function typeGroupOf(card: DeckCard) {
  const words = card.type_line.split(/[^A-Za-z]+/);
  return (typeGroups.find(({ type }) => words.includes(type)) ?? typeGroups[typeGroups.length - 1]).title;
}

export function deckCommanders(cards: DeckCard[]) {
  return cards
    .filter((card) => card.role === 'commander')
    .toSorted((a, b) => a.commander_at!.localeCompare(b.commander_at!) || byName(a, b));
}

export function mainDeckGroups(cards: DeckCard[]): DeckGroup[] {
  const mainDeck = cards.filter((card) => card.role === 'main').toSorted(byName);
  return typeGroups
    .map(({ title }) => ({ title, cards: mainDeck.filter((card) => typeGroupOf(card) === title) }))
    .filter((group) => group.cards.length > 0);
}
