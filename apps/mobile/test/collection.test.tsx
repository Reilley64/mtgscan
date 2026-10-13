import type { CollectionCopyRow, CollectionTotal, CurrentPrice } from '@mtgscan/supabase/collection';
import { fireEvent, screen, within } from 'expo-router/testing-library';
import { processColor } from 'react-native';

import { failCollectionReads, ownCollectionCopies, ownCollectionTotal, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  cardImageUri,
  cardSheen,
  imageTintColor,
  isPopoverOpen,
  pressTab,
  scrollTabTo,
  scrollToEnd,
  selectedTab,
  symbolNames,
  tapOutsidePopover,
  touchTarget,
} from './native-ui';
import { setIconUri } from './card-printings';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { textDim, textMuted, textPrice, text: white, surfaceControl, surfaceRaised } = tokenColors;

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
    price: null,
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

  const curatorTiles = collection.getAllByRole('image', { name: 'Angelic Curator, EXO 146, no price' });
  expect(curatorTiles).toHaveLength(3);
  curatorTiles.forEach((tile) => {
    expect(cardImageUri(tile)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
  });
  const delverTile = collection.getByRole('image', { name: 'Delver of Secrets // Insectile Aberration, ISD 51, no price' });
  expect(cardImageUri(delverTile)).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
  expect(collection.queryByText('3')).not.toBeOnTheScreen();
  expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
});

test('under each card, one line shows the set icon from the card catalog and the collector number', async () => {
  ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1, { set: 'exo', collector_number: '146' }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Angelic Curator, EXO 146, no price' });
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

  const mythic = await within(collection.getByRole('image', { name: 'Angelic Curator, EXO 1, no price' })).findByLabelText('EXO');
  const common = within(collection.getByRole('image', { name: 'Ponder, LRW 79, no price' })).getByLabelText('LRW');
  expect(imageTintColor(mythic)).toBe(processColor('#f26a35'));
  expect(imageTintColor(common)).toBe(processColor('#e6e8e9'));
});

test('the line shows the set code when the card catalog has no icon for the set', async () => {
  ownCollectionCopies(collectionEntryCopies('Sol Ring', 1, { set: 'c21', collector_number: '263' }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Sol Ring, C21 263, no price' });
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

  const tile = collection.getByRole('image', { name: `Ponder, LRW 79, ${spoken}, no price` });
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
    name: 'Bloomvine Regent // Claim Territory, TDM 136, foil, moderately played, no price',
  });
  const etched = collection.getByRole('image', { name: 'Sol Ring, CMM 464, etched, no price' });
  const nonfoil = collection.getByRole('image', { name: 'Ribbons of Night, SHM 74, no price' });
  expect(cardSheen(foil)).toMatchObject({ opacity: expect.closeTo(0.3) });
  expect(cardSheen(etched)).toMatchObject({ opacity: expect.closeTo(0.3) });
  expect(cardSheen(etched)!.experimental_backgroundImage).not.toEqual(cardSheen(foil)!.experimental_backgroundImage);
  expect(cardSheen(nonfoil)).toBeNull();
  for (const finish of ['Foil', 'Etched', 'Nonfoil', 'NM']) {
    expect(collection.queryByText(finish)).not.toBeOnTheScreen();
  }
});

function currentPrice(amount: string, changes: Partial<CurrentPrice> = {}): CurrentPrice {
  return { amount, currency: 'USD', finish: 'nonfoil', stale: false, ...changes };
}

test('under the meta line, a price line shows the current price in full in the price color', async () => {
  ownCollectionCopies(
    collectionEntryCopies('Black Lotus', 1, {
      set: 'lea',
      collector_number: '232',
      condition: 'heavily_played',
      price: currentPrice('1635.37'),
    }),
  );

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Black Lotus, LEA 232, heavily played, $1,635.37' });
  expect(within(tile).getByText('$1,635.37')).toHaveStyle({ color: textPrice, fontSize: 12, fontWeight: '600' });
  expect(appearsBefore(within(tile).getByText('232'), within(tile).getByText('$1,635.37'))).toBe(true);
  expect(symbolNames(tile)).toEqual([]);
  expect(tile).not.toHaveProp('accessibilityHint');
});

test.each([
  ['USD', '96.24', '$96.24'],
  ['EUR', '96.24', '€96.24'],
  ['USD', '0.21', '$0.21'],
] as const)('a %s price of %s shows as %s', async (currency, amount, shown) => {
  ownCollectionCopies(collectionEntryCopies('The One Ring', 1, { set: 'ltr', collector_number: '246', price: currentPrice(amount, { currency }) }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: `The One Ring, LTR 246, ${shown}` });
  expect(within(tile).getByText(shown)).toBeOnTheScreen();
});

test('a copy with no price shows a dim dash, and VoiceOver says no price', async () => {
  ownCollectionCopies(collectionEntryCopies('Sakashima of a Thousand Faces', 1, { set: 'cmr', collector_number: '561', finish: 'etched' }));

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Sakashima of a Thousand Faces, CMR 561, etched, no price' });
  expect(within(tile).getByText('–')).toHaveStyle({ color: textDim });
  expect(symbolNames(tile)).toEqual([]);
});

test('a stale price has a clock symbol before it, and VoiceOver hears that it may be out of date', async () => {
  ownCollectionCopies(
    collectionEntryCopies('Rhystic Study', 1, { set: 'pcy', collector_number: '45', price: currentPrice('36.96', { stale: true }) }),
  );

  const collection = await openCollection();

  const tile = collection.getByRole('image', { name: 'Rhystic Study, PCY 45, $36.96' });
  expect(tile).toHaveProp('accessibilityHint', 'The price may be out of date.');
  expect(symbolNames(tile)).toEqual(['clock']);
  expect(within(tile).getByText('$36.96')).toHaveStyle({ color: textPrice });
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

describe('the collection total', () => {
  function collectionTotal(changes: Partial<CollectionTotal> = {}): CollectionTotal {
    return {
      total: '2419.59',
      currency: 'USD',
      priced_copies: 26,
      copies: 27,
      change: '12.40',
      change_since: '2026-10-12',
      ...changes,
    };
  }

  async function openCollectionWithTotal(total: CollectionTotal) {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    ownCollectionTotal(total);
    return openCollection();
  }

  async function openTotal(collection: Awaited<ReturnType<typeof openCollection>>, name: string) {
    await fireEvent.press(collection.getByRole('button', { name }));
    return screen.getByLabelText(new RegExp(`^${RegExp.escape(name)}, `));
  }

  test('a compact total button sits next to the settings button with the total and a chevron', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    const button = collection.getByRole('button', { name: 'Collection total, $2,419.59' });
    expect(button).toHaveAccessibilityValue({ text: 'up $12.40 since yesterday, 26 of 27 cards priced' });
    expect(within(button).getByText('$2,419.59')).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(symbolNames(button)).toEqual(['chevron.down']);
    expect(button).toHaveStyle({ backgroundColor: surfaceControl, borderRadius: 999, height: 38 });
    expect(touchTarget(button).height).toBeGreaterThanOrEqual(44);
    expect(appearsBefore(button, collection.getByRole('button', { name: 'Settings' }))).toBe(true);
  });

  test('tapping the total opens a popover with the total, the change since yesterday, the coverage, and the price source', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    const popover = await openTotal(collection, 'Collection total, $2,419.59');

    expect(popover).toHaveAccessibleName(
      'Collection total, $2,419.59, up $12.40 since yesterday, 26 of 27 cards priced, Current prices from Scryfall, in USD',
    );
    expect(within(popover).getByText('$2,419.59')).toHaveStyle({ fontSize: 20, fontWeight: '800' });
    expect(within(popover).getByText('Since yesterday')).toHaveStyle({ color: textMuted });
    expect(within(popover).getByText('+$12.40')).toHaveStyle({ color: white });
    expect(within(popover).getByText('Priced')).toBeOnTheScreen();
    expect(within(popover).getByText('26 of 27 cards')).toHaveStyle({ color: white });
    expect(within(popover).getByText('Current prices from Scryfall, in USD')).toHaveStyle({ color: textDim });
    expect(popover).toHaveStyle({ backgroundColor: surfaceRaised, borderRadius: 12 });
    expect(collection.getByRole('button', { name: 'Collection total, $2,419.59' })).toBeExpanded();
  });

  test('a tap outside the popover closes it', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());
    await openTotal(collection, 'Collection total, $2,419.59');

    await tapOutsidePopover();

    expect(isPopoverOpen()).toBe(false);
    expect(collection.getByRole('button', { name: 'Collection total, $2,419.59' })).not.toBeExpanded();
  });

  test('a falling total shows the minus sign in the same neutral text, and VoiceOver hears down', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ total: '2368.44', change: '-38.75' }));

    const button = collection.getByRole('button', { name: 'Collection total, $2,368.44' });
    expect(button).toHaveAccessibilityValue({ text: 'down $38.75 since yesterday, 26 of 27 cards priced' });
    const popover = await openTotal(collection, 'Collection total, $2,368.44');
    expect(within(popover).getByText('\u2212$38.75')).toHaveStyle({ color: white });
  });

  test('an unchanged total shows the change with no sign', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ change: '0.00' }));

    const button = collection.getByRole('button', { name: 'Collection total, $2,419.59' });
    expect(button).toHaveAccessibilityValue({ text: 'no change since yesterday, 26 of 27 cards priced' });
    const popover = await openTotal(collection, 'Collection total, $2,419.59');
    expect(within(popover).getByText('$0.00')).toBeOnTheScreen();
  });

  test('before the first daily total, the change is a dim dash, and VoiceOver hears that it is not known yet', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ change: null, change_since: null }));

    const button = collection.getByRole('button', { name: 'Collection total, $2,419.59' });
    expect(button).toHaveAccessibilityValue({ text: 'change since yesterday not known yet, 26 of 27 cards priced' });
    const popover = await openTotal(collection, 'Collection total, $2,419.59');
    expect(within(popover).getByText('–')).toHaveStyle({ color: textDim });
  });

  test('a long total and a large collection show in full', async () => {
    const collection = await openCollectionWithTotal(
      collectionTotal({ total: '128406.92', priced_copies: 1262, copies: 1284, change: '412.60' }),
    );

    const popover = await openTotal(collection, 'Collection total, $128,406.92');
    expect(within(popover).getByText('1,262 of 1,284 cards')).toBeOnTheScreen();
    expect(within(popover).getByText('+$412.60')).toBeOnTheScreen();
  });

  test('a EUR total shows in euros and names EUR as the price currency', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ total: '2096.10', currency: 'EUR', change: '10.85' }));

    const popover = await openTotal(collection, 'Collection total, €2,096.10');
    expect(within(popover).getByText('+€10.85')).toBeOnTheScreen();
    expect(within(popover).getByText('Current prices from Scryfall, in EUR')).toBeOnTheScreen();
  });

  test('with no collection entries, the header shows no total', async () => {
    const collection = await openCollection();

    expect(collection.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
    expect(collection.queryByRole('button', { name: /^Collection total/ })).not.toBeOnTheScreen();
  });

  test('the total reloads when the Collection tab gains focus again', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());
    expect(collection.getByRole('button', { name: 'Collection total, $2,419.59' })).toBeOnTheScreen();

    ownCollectionTotal(collectionTotal({ total: '2420.80', copies: 28, priced_copies: 27 }));
    await pressTab('Recent');
    await pressTab('Collection');

    expect(await within(selectedTab()).findByRole('button', { name: 'Collection total, $2,420.80' })).toBeOnTheScreen();
  });

  test('when the user scrolls, a small-title header keeps the total and the settings button', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    await scrollTabTo(selectedTab(), 120);

    const smallTitle = collection.getByRole('header', { name: 'Collection' });
    expect(smallTitle).toHaveStyle({ fontSize: 17, fontWeight: '800' });
    expect(collection.getAllByRole('button', { name: 'Collection total, $2,419.59' })).toHaveLength(1);
    expect(collection.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(appearsBefore(smallTitle, collection.getByRole('button', { name: 'Collection total, $2,419.59' }))).toBe(true);
    const popover = await openTotal(collection, 'Collection total, $2,419.59');
    expect(within(popover).getByText('+$12.40')).toBeOnTheScreen();
  });

  test('scrolling back to the top brings back the large title', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());
    await scrollTabTo(selectedTab(), 120);

    await scrollTabTo(selectedTab(), -62);

    expect(collection.getByRole('header', { name: 'Collection' })).toHaveStyle({ fontSize: 28 });
    expect(collection.getAllByRole('button', { name: 'Collection total, $2,419.59' })).toHaveLength(1);
  });
});
