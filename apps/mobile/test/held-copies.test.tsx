import { fireEvent, within } from 'expo-router/testing-library';

import { copyOf, openCollection, openCopyPage } from './copies';
import { ownCopies, ownDecks, startSignedIn } from './fake-supabase';
import { headerMenuRows, pushedScreen, symbolNames, symbolTintColor } from './native-ui';
import { tokenColors } from './token-colors';

const { info } = tokenColors;

const commanderArt = 'https://cards.scryfall.io/art_crop/front/krenko.jpg';

const heldForGoblins = copyOf('copy-1', {
  held_for: { deck_id: 'deck-1', name: 'Goblins', commander_art_crop_uri: commanderArt },
});

beforeEach(() => {
  startSignedIn();
});

test('a held binder tile starts its line with the held symbol in the info color, and VoiceOver hears the deck of its planned swap', async () => {
  ownCopies([heldForGoblins, copyOf('copy-2', { name: 'Ponder' })]);

  const collection = await openCollection();

  const held = collection.getByRole('button', { name: 'Angelic Curator, MH2 262, held for the deck Goblins, $0.35' });
  const line = within(held).getByText('262').parent!;
  expect(symbolNames(line)).toEqual(['bookmark.fill']);
  expect(symbolTintColor(line)).toBe(info);
  const free = collection.getByRole('button', { name: 'Ponder, MH2 262, $0.35' });
  expect(symbolNames(within(free).getByText('262').parent!)).toEqual([]);
});

test('the copy page of a held copy shows the Held chip and the deck tag of its planned swap, which opens the deck', async () => {
  ownDecks([{ name: 'Goblins', priority: 'medium', card_count: 0 }]);
  ownCopies([heldForGoblins]);
  await openCopyPage(/^Angelic Curator/);
  const page = within(pushedScreen());

  const chip = page.getByText('Held');
  expect(chip).toHaveStyle({ color: info });
  expect(symbolNames(chip.parent!)).toContain('bookmark.fill');
  const tag = page.getByRole('button', { name: 'Goblins' });
  expect(headerMenuRows(pushedScreen(), 'More').map((row) => row.title)).toEqual(['Delete copy']);

  await fireEvent.press(tag);

  expect(await within(pushedScreen()).findByRole('header', { name: 'Goblins' })).toBeOnTheScreen();
});
