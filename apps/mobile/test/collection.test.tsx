import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { failCollectionReads, ownCollectionCopies, startSignedIn } from './fake-supabase';
import { appearsBefore, cardImageUri, pressTab, scrollToEnd, selectedTab } from './native-ui';
import { renderApp } from './render-app';

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

test('the binder grid shows one tile per copy with its image and set and collector number, and no quantity badge', async () => {
  ownCollectionCopies([
    ...collectionEntryCopies('Angelic Curator', 3, {
      set: 'exo',
      collector_number: '1',
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

  const curatorTiles = collection.getAllByRole('image', { name: 'Angelic Curator, EXO 1' });
  expect(curatorTiles).toHaveLength(3);
  curatorTiles.forEach((tile) => {
    expect(within(tile).getByText('EXO 1')).toBeOnTheScreen();
    expect(cardImageUri(tile)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
  });
  const delverTile = collection.getByRole('image', { name: 'Delver of Secrets // Insectile Aberration, ISD 51' });
  expect(cardImageUri(delverTile)).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
  expect(collection.queryByText('3')).not.toBeOnTheScreen();
  expect(collection.queryByText('1')).not.toBeOnTheScreen();
  expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
});

test('a tile shows the finish when it is not nonfoil and the condition when it is not NM', async () => {
  ownCollectionCopies([
    ...collectionEntryCopies('Angelic Curator', 1, { set: 'exo', collector_number: '1', finish: 'foil', condition: 'lightly_played' }),
    ...collectionEntryCopies('Sol Ring', 1, { set: 'cmm', collector_number: '464', finish: 'etched' }),
    ...collectionEntryCopies('Ponder', 1, { set: 'lrw', collector_number: '79', condition: 'damaged' }),
    ...collectionEntryCopies('Ribbons of Night', 1, { set: 'shm', collector_number: '74' }),
  ]);

  const collection = await openCollection();

  const foil = collection.getByRole('image', { name: 'Angelic Curator, EXO 1, Foil, LP' });
  expect(within(foil).getByText('Foil')).toBeOnTheScreen();
  expect(within(foil).getByText('LP')).toBeOnTheScreen();
  const etched = collection.getByRole('image', { name: 'Sol Ring, CMM 464, Etched' });
  expect(within(etched).getByText('Etched')).toBeOnTheScreen();
  expect(within(etched).queryByText('NM')).not.toBeOnTheScreen();
  const damaged = collection.getByRole('image', { name: 'Ponder, LRW 79, DMG' });
  expect(within(damaged).getByText('DMG')).toBeOnTheScreen();
  expect(within(damaged).queryByText('Nonfoil')).not.toBeOnTheScreen();
  const plain = collection.getByRole('image', { name: 'Ribbons of Night, SHM 74' });
  expect(within(plain).getAllByText(/./).map((text) => text.props.children)).toEqual(['SHM 74']);
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
