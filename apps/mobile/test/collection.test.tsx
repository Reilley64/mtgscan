import type { CollectionPrintingRow } from '@mtgscan/supabase/collection';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { failCollectionReads, ownCollectionPrintings, startSignedIn } from './fake-supabase';
import { appearsBefore, cardImageUri, pressTab, scrollToEnd, selectedTab } from './native-ui';
import { renderApp } from './render-app';

let printingNumber = 0;

function collectionPrinting(
  name: string,
  changes: Partial<Omit<CollectionPrintingRow, 'name'>> = {},
): CollectionPrintingRow {
  printingNumber += 1;
  return {
    printing_id: `printing-${printingNumber}`,
    name,
    set: 'isd',
    collector_number: String(printingNumber),
    image_uris: [`https://cards.scryfall.io/normal/front/${printingNumber}.jpg`],
    owned_quantity: 1,
    latest_addition_at: new Date(Date.UTC(2026, 9, 18) - printingNumber * 1000).toISOString(),
    ...changes,
  };
}

async function openCollection() {
  await renderApp();
  await pressTab('Collection');
  return within(selectedTab());
}

beforeEach(() => {
  startSignedIn();
});

test('the binder grid shows one tile per card printing with its image, set and collector number, and owned count', async () => {
  const curator = collectionPrinting('Angelic Curator', {
    set: 'exo',
    collector_number: '1',
    owned_quantity: 10,
    image_uris: ['https://cards.scryfall.io/normal/front/curator.jpg'],
  });
  const delver = collectionPrinting('Delver of Secrets // Insectile Aberration', {
    set: 'isd',
    collector_number: '51',
    owned_quantity: 1,
    image_uris: ['https://cards.scryfall.io/normal/front/delver.jpg', 'https://cards.scryfall.io/normal/front/aberration.jpg'],
  });
  ownCollectionPrintings([curator, delver]);

  const collection = await openCollection();

  const curatorTile = collection.getByRole('image', { name: 'Angelic Curator, EXO 1, 10 owned' });
  expect(within(curatorTile).getByText('EXO 1')).toBeOnTheScreen();
  expect(within(curatorTile).getByText('10')).toBeOnTheScreen();
  expect(cardImageUri(curatorTile)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
  const delverTile = collection.getByRole('image', {
    name: 'Delver of Secrets // Insectile Aberration, ISD 51, 1 owned',
  });
  expect(within(delverTile).getByText('1')).toBeOnTheScreen();
  expect(cardImageUri(delverTile)).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
  expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
});

test('the binder grid shows the newest addition first', async () => {
  ownCollectionPrintings([collectionPrinting('Ribbons of Night'), collectionPrinting('Angelic Curator')]);

  const collection = await openCollection();

  expect(
    appearsBefore(
      collection.getByRole('image', { name: /^Ribbons of Night/ }),
      collection.getByRole('image', { name: /^Angelic Curator/ }),
    ),
  ).toBe(true);
});

test('the binder grid loads more tiles as the user scrolls', async () => {
  const printings = Array.from({ length: 70 }, (_, index) => collectionPrinting(`Card ${index + 1}`));
  ownCollectionPrintings(printings);
  const collection = await openCollection();
  expect(collection.queryByRole('image', { name: /^Card 70,/ })).not.toBeOnTheScreen();

  await scrollToEnd(selectedTab());


  expect(await collection.findByRole('image', { name: /^Card 70,/ })).toBeOnTheScreen();
});

test('the Collection tab shows newly added card printings when it gains focus again', async () => {
  ownCollectionPrintings([collectionPrinting('Angelic Curator')]);
  const collection = await openCollection();
  expect(collection.getByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();

  ownCollectionPrintings([collectionPrinting('Ribbons of Night'), collectionPrinting('Angelic Curator')]);
  await pressTab('Recent');
  await pressTab('Collection');

  expect(await within(selectedTab()).findByRole('image', { name: /^Ribbons of Night/ })).toBeOnTheScreen();
});

test('a failed binder grid read offers Try again, which shows the tiles', async () => {
  ownCollectionPrintings([collectionPrinting('Angelic Curator')]);
  failCollectionReads(1);

  const collection = await openCollection();
  expect(collection.getByText('Could not load your collection')).toBeOnTheScreen();

  await fireEvent.press(collection.getByRole('button', { name: 'Try again' }));

  expect(await within(selectedTab()).findByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  expect(screen.queryByText('Could not load your collection')).not.toBeOnTheScreen();
});
