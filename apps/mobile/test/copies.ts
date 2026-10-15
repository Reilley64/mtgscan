import type { CopyDetails } from '@mtgscan/supabase/collection';
import type { DeckCard } from '@mtgscan/supabase/decks';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { ownDecks } from './fake-supabase';
import { pressTab, pushedScreen, selectedTab } from './native-ui';
import { renderApp } from './render-app';

export function copyOf(copyId: string, changes: Partial<CopyDetails> = {}): CopyDetails {
  return {
    copy_id: copyId,
    printing_id: 'printing-curator',
    name: 'Angelic Curator',
    set: 'mh2',
    collector_number: '262',
    rarity: 'uncommon',
    image_uris: ['https://cards.scryfall.io/normal/front/curator.jpg'],
    art_crop_uri: 'https://cards.scryfall.io/art_crop/front/curator.jpg',
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    protected: false,
    free: true,
    added_at: '2026-10-12T12:00:00.000Z',
    purchase_day_price: { amount: '0.21', currency: 'USD', finish: 'nonfoil' },
    price: { amount: '0.35', currency: 'USD', finish: 'nonfoil', stale: false },
    type_line: 'Creature — Angel Spirit',
    faces: [{ name: 'Angelic Curator', oracle_text: 'Flying, protection from artifacts' }],
    commander_legality: 'legal',
    user_tags: [],
    deck: null,
    ...changes,
  };
}

export function deckCardOf(copyId: string, name: string, typeLine: string, changes: Partial<DeckCard> = {}): DeckCard {
  const { deck, free, added_at, purchase_day_price, faces, commander_legality, user_tags, art_crop_uri, ...row } = copyOf(copyId, {
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${copyId}.jpg`],
  });
  return {
    ...row,
    role: 'main',
    commander_at: null,
    added_at: '2026-10-15T09:00:00.000Z',
    type_line: typeLine,
    mana_value: 2,
    colors: [],
    ...changes,
  };
}

export async function openDeckNamed(name: string) {
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: new RegExp(`^${name},`) }));
  const deck = within(pushedScreen());
  await deck.findByRole('header', { name });
  return deck;
}

export async function openDeckWithCards(cards: DeckCard[]) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: cards.length, cards }]);
  await renderApp();
  await pressTab('Decks');
  return openDeckNamed('Atraxa');
}

export const delver = copyOf('copy-delver', {
  printing_id: 'printing-delver',
  name: 'Delver of Secrets // Insectile Aberration',
  set: 'isd',
  collector_number: '51',
  image_uris: ['https://cards.scryfall.io/normal/front/delver.jpg', 'https://cards.scryfall.io/normal/back/delver.jpg'],
  art_crop_uri: 'https://cards.scryfall.io/art_crop/front/delver.jpg',
  type_line: 'Creature — Human Wizard // Creature — Human Insect',
  faces: [
    { name: 'Delver of Secrets', oracle_text: 'At the beginning of your upkeep, look at the top card of your library.' },
    { name: 'Insectile Aberration', oracle_text: 'Flying' },
  ],
});

export async function openCollection() {
  await renderApp();
  await pressTab('Collection');
  return within(selectedTab());
}

export async function openCopyPage(tileName: string | RegExp) {
  const collection = await openCollection();
  await fireEvent.press(collection.getByRole('button', { name: tileName }));
  await screen.findByRole('header', { name: 'Price' });
}
