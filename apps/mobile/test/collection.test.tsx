import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { fireEvent, screen, within } from 'expo-router/testing-library';
import { processColor } from 'react-native';

import { failCollectionReads, ownCollectionCopies, startSignedIn } from './fake-supabase';
import { appearsBefore, cardImageUri, cardSheen, imageTintColor, pressTab, scrollToEnd, selectedTab } from './native-ui';
import { setIconUri } from './card-printings';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { textMuted } = tokenColors;

let entryNumber = 0;

function collectionEntryCopies(
  name: string,
  quantity: number,
  changes: Partial<Omit<CollectionCopyRow, 'name' | 'collection_entry_id' | 'copy_number'>> = {},
): CollectionCopyRow[] {
  entryNumber += 1;
  return Array.from({ length: quantity }, (_, copy) => ({
    collection_entry_id: `entry-${entryNumber}`,
    copy_number: copy + 1,
    printing_id: `printing-${entryNumber}`,
    name,
    set: 'isd',
    collector_number: String(entryNumber),
    rarity: 'common',
    image_uris: [`https://cards.scryfall.io/normal/front/${entryNumber}.jpg`],
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    protected: false,
    ...changes,
  }));
}

async function openCollection() {
  await renderApp();
  await pressTab('Collection');
  return within(selectedTab());
}

beforeEach(() => {
  startSignedIn();
});

test('Collection keeps its empty state when the user has no collection entries', async () => {
  const collection = await openCollection();

  expect(collection.getByRole('header', { name: 'Collection' })).toBeOnTheScreen();
  expect(collection.getByText('Your collection is empty')).toBeOnTheScreen();
  expect(collection.getByText('Scan cards to add them to your collection.')).toBeOnTheScreen();
  expect(collection.queryByRole('image')).not.toBeOnTheScreen();
});

test('the binder grid shows one tile per copy with its image and no quantity badge', async () => {
  ownCollectionCopies([
    ...collectionEntryCopies('Angelic Curator', 3, {
      set: 'exo',
      collector_number: '146',
      image_uris: ['https://cards.scryfall.io/normal/front/curator.jpg'],
    }),
    ...collectionEntryCopies('Delver of Secrets // Insectile Aberration', 1, {
      set: 'isd',
      collector_number: '51',
      image_uris: [
        'https://cards.scryfall.io/normal/front/delver.jpg',
        'https://cards.scryfall.io/normal/front/aberration.jpg',
      ],
    }),
  ]);

  const collection = await openCollection();

  const curatorTiles = collection.getAllByRole('image', { name: 'Angelic Curator, EXO 146' });
  expect(curatorTiles).toHaveLength(3);
  curatorTiles.forEach((tile) => {
    expect(cardImageUri(tile)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
  });
  const delverTile = collection.getByRole('image', { name: 'Delver of Secrets // Insectile Aberration, ISD 51' });
  expect(cardImageUri(delverTile)).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
  expect(collection.queryByText('3')).not.toBeOnTheScreen();
  expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
});

test('under each card, one line shows the set icon from the card catalog and the collector number', async () => {
  ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1, { set: 'exo', collector_number: '146' }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Angelic Curator, EXO 146' });
  const setIcon = await within(tile).findByLabelText('EXO');
  expect(cardImageUri(setIcon)).toBe(setIconUri('exo'));
  expect(within(tile).queryByText('EXO')).not.toBeOnTheScreen();
  expect(within(tile).getByText('146')).toBeOnTheScreen();
  expect(within(tile).queryByText('·')).not.toBeOnTheScreen();
  expect(within(tile).queryByText('EXO 146')).not.toBeOnTheScreen();
});

test('the set icon has the rarity color of the card printing', async () => {
  ownCollectionCopies([
    ...collectionEntryCopies('Angelic Curator', 1, { set: 'exo', collector_number: '1', rarity: 'mythic' }),
    ...collectionEntryCopies('Ponder', 1, { set: 'lrw', collector_number: '79', rarity: 'common' }),
  ]);

  const collection = await openCollection();

  const mythic = await within(collection.getByRole('image', { name: 'Angelic Curator, EXO 1' })).findByLabelText('EXO');
  const common = within(collection.getByRole('image', { name: 'Ponder, LRW 79' })).getByLabelText('LRW');
  expect(imageTintColor(mythic)).toBe(processColor('#f26a35'));
  expect(imageTintColor(common)).toBe(processColor('#e6e8e9'));
});

test('the line shows the set code when the card catalog has no icon for the set', async () => {
  ownCollectionCopies(collectionEntryCopies('Sol Ring', 1, { set: 'c21', collector_number: '263' }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Sol Ring, C21 263' });
  expect(within(tile).getByText('C21')).toBeOnTheScreen();
});

test.each([
  ['lightly_played', 'LP', 'lightly played'],
  ['moderately_played', 'MP', 'moderately played'],
  ['heavily_played', 'HP', 'heavily played'],
  ['damaged', 'DMG', 'damaged'],
] as const)('a %s copy adds its condition to the line in the same muted text', async (condition, shown, spoken) => {
  ownCollectionCopies(collectionEntryCopies('Ponder', 1, { set: 'lrw', collector_number: '79', condition }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: `Ponder, LRW 79, ${spoken}` });
  expect(within(tile).getByText('·')).toBeOnTheScreen();
  expect(within(tile).getByText(shown)).toHaveStyle({ color: textMuted });
});

test('foil and etched copies have a sheen on the card image and say their finish only to VoiceOver', async () => {
  ownCollectionCopies([
    ...collectionEntryCopies('Bloomvine Regent // Claim Territory', 1, {
      set: 'tdm',
      collector_number: '136',
      finish: 'foil',
      condition: 'moderately_played',
    }),
    ...collectionEntryCopies('Sol Ring', 1, { set: 'cmm', collector_number: '464', finish: 'etched' }),
    ...collectionEntryCopies('Ribbons of Night', 1, { set: 'shm', collector_number: '74' }),
  ]);

  const collection = await openCollection();

  const foil = collection.getByRole('image', {
    name: 'Bloomvine Regent // Claim Territory, TDM 136, foil, moderately played',
  });
  const etched = collection.getByRole('image', { name: 'Sol Ring, CMM 464, etched' });
  const nonfoil = collection.getByRole('image', { name: 'Ribbons of Night, SHM 74' });
  expect(cardSheen(foil)).toMatchObject({ opacity: expect.closeTo(0.3) });
  expect(cardSheen(etched)).toMatchObject({ opacity: expect.closeTo(0.3) });
  expect(cardSheen(etched)!.experimental_backgroundImage).not.toEqual(cardSheen(foil)!.experimental_backgroundImage);
  expect(cardSheen(nonfoil)).toBeNull();
  for (const finish of ['Foil', 'Etched', 'Nonfoil', 'NM']) {
    expect(collection.queryByText(finish)).not.toBeOnTheScreen();
  }
});

test('the binder grid shows the newest addition first', async () => {
  ownCollectionCopies([...collectionEntryCopies('Ribbons of Night', 1), ...collectionEntryCopies('Angelic Curator', 1)]);

  const collection = await openCollection();

  expect(
    appearsBefore(
      collection.getByRole('image', { name: /^Ribbons of Night/ }),
      collection.getByRole('image', { name: /^Angelic Curator/ }),
    ),
  ).toBe(true);
});

test('the binder grid loads more tiles as the user scrolls', async () => {
  ownCollectionCopies(Array.from({ length: 70 }, (_, index) => collectionEntryCopies(`Card ${index + 1}`, 1)).flat());
  const collection = await openCollection();
  expect(collection.queryByRole('image', { name: /^Card 70,/ })).not.toBeOnTheScreen();

  await scrollToEnd(selectedTab());

  expect(await collection.findByRole('image', { name: /^Card 70,/ })).toBeOnTheScreen();
});

test('the Collection tab shows newly added copies when it gains focus again', async () => {
  const curator = collectionEntryCopies('Angelic Curator', 1);
  ownCollectionCopies(curator);
  const collection = await openCollection();
  expect(collection.getByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();

  ownCollectionCopies([...collectionEntryCopies('Ribbons of Night', 1), ...curator]);
  await pressTab('Recent');
  await pressTab('Collection');

  expect(await within(selectedTab()).findByRole('image', { name: /^Ribbons of Night/ })).toBeOnTheScreen();
});

test('a failed binder grid read offers Try again, which shows the tiles', async () => {
  ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
  failCollectionReads(1);

  const collection = await openCollection();
  expect(collection.getByText('Could not load your collection')).toBeOnTheScreen();

  await fireEvent.press(collection.getByRole('button', { name: 'Try again' }));

  expect(await within(selectedTab()).findByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  expect(screen.queryByText('Could not load your collection')).not.toBeOnTheScreen();
});
