import type { CopyDetails } from '@mtgscan/supabase/collection';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { pressTab, selectedTab } from './native-ui';
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
    ...changes,
  };
}

export const delver = copyOf('copy-delver', {
  printing_id: 'printing-delver',
  name: 'Delver of Secrets // Insectile Aberration',
  set: 'isd',
  collector_number: '51',
  image_uris: ['https://cards.scryfall.io/normal/front/delver.jpg', 'https://cards.scryfall.io/normal/back/delver.jpg'],
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
