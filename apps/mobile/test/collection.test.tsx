import type { CollectionCopyRow, CollectionTotal, CurrentPrice } from '@mtgscan/supabase/collection';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { processColor } from 'react-native';

import {
  answerCollectionSearches,
  collectionSearchesSent,
  expireCollectionSearchCursors,
  failCollectionReads,
  holdCollectionReads,
  ownCollectionCopies,
  ownCollectionTotal,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  buttonMenu,
  cardImageUri,
  cardSheen,
  headerButton,
  headerMenu,
  imageTintColor,
  menuButton,
  menuButtonNames,
  pressableMenuRows,
  pressButtonMenuItem,
  pressBackspaceInSearchBar,
  pressSearchCancel,
  pressSearchKey,
  pressTab,
  scrollToEnd,
  selectedTab,
  shownSearchText,
  symbolNames,
  symbolTintColor,
  tabHeader,
  tabSearchBar,
  typeInSearchBar,
} from './native-ui';
import { setIconUri } from './card-printings';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { danger, primary, text, textDim, textMuted, textPrice } = tokenColors;

let entryNumber = 0;

function collectionEntryCopies(
  name: string,
  quantity: number,
  changes: Partial<Omit<CollectionCopyRow, 'name' | 'copy_id'>> = {},
): CollectionCopyRow[] {
  entryNumber += 1;
  return Array.from({ length: quantity }, (_, copy) => ({
    copy_id: `copy-${entryNumber}-${copy + 1}`,
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

function skeletonGrid() {
  return within(selectedTab()).queryByRole('progressbar', { name: 'Loading collection' });
}

beforeEach(() => {
  startSignedIn();
});

test('Collection keeps its empty state when the user has no collection entries', async () => {
  const collection = await openCollection();

  expect(tabHeader(selectedTab()).title).toBe('Collection');
  expect(collection.getByText('Your collection is empty')).toBeOnTheScreen();
  expect(collection.getByText('Scan cards to add them to your collection.')).toBeOnTheScreen();
  expect(collection.queryByRole('button')).not.toBeOnTheScreen();
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

  const curatorTiles = collection.getAllByRole('button', { name: 'Angelic Curator, EXO 146, no price' });
  expect(curatorTiles).toHaveLength(3);
  curatorTiles.forEach((tile) => {
    expect(cardImageUri(tile)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
  });
  const delverTile = collection.getByRole('button', { name: 'Delver of Secrets // Insectile Aberration, ISD 51, no price' });
  expect(cardImageUri(delverTile)).toBe('https://cards.scryfall.io/normal/front/delver.jpg');
  expect(collection.queryByText('3')).not.toBeOnTheScreen();
  expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
});

test('under each card, one line shows the set icon from the card catalog and the collector number', async () => {
  ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1, { set: 'exo', collector_number: '146' }));

  const collection = await openCollection();

  const tile = collection.getByRole('button', { name: 'Angelic Curator, EXO 146, no price' });
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

  const mythic = await within(collection.getByRole('button', { name: 'Angelic Curator, EXO 1, no price' })).findByLabelText('EXO');
  const common = within(collection.getByRole('button', { name: 'Ponder, LRW 79, no price' })).getByLabelText('LRW');
  expect(imageTintColor(mythic)).toBe(processColor('#f26a35'));
  expect(imageTintColor(common)).toBe(processColor('#e6e8e9'));
});

test('the line shows the set code when the card catalog has no icon for the set', async () => {
  ownCollectionCopies(collectionEntryCopies('Sol Ring', 1, { set: 'c21', collector_number: '263' }));

  const collection = await openCollection();

  const tile = collection.getByRole('button', { name: 'Sol Ring, C21 263, no price' });
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

  const tile = collection.getByRole('button', { name: `Ponder, LRW 79, ${spoken}, no price` });
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

  const foil = collection.getByRole('button', {
    name: 'Bloomvine Regent // Claim Territory, TDM 136, foil, moderately played, no price',
  });
  const etched = collection.getByRole('button', { name: 'Sol Ring, CMM 464, etched, no price' });
  const nonfoil = collection.getByRole('button', { name: 'Ribbons of Night, SHM 74, no price' });
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

  const tile = collection.getByRole('button', { name: 'Black Lotus, LEA 232, heavily played, $1,635.37' });
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

  const tile = collection.getByRole('button', { name: `The One Ring, LTR 246, ${shown}` });
  expect(within(tile).getByText(shown)).toBeOnTheScreen();
});

test('a copy with no price shows a dim dash, and VoiceOver says no price', async () => {
  ownCollectionCopies(collectionEntryCopies('Sakashima of a Thousand Faces', 1, { set: 'cmr', collector_number: '561', finish: 'etched' }));

  const collection = await openCollection();

  const tile = collection.getByRole('button', { name: 'Sakashima of a Thousand Faces, CMR 561, etched, no price' });
  expect(within(tile).getByText('–')).toHaveStyle({ color: textDim });
  expect(symbolNames(tile)).toEqual([]);
});

test('a stale price has a clock symbol before it, and VoiceOver hears that it may be out of date', async () => {
  ownCollectionCopies(
    collectionEntryCopies('Rhystic Study', 1, { set: 'pcy', collector_number: '45', price: currentPrice('36.96', { stale: true }) }),
  );

  const collection = await openCollection();

  const tile = collection.getByRole('button', { name: 'Rhystic Study, PCY 45, $36.96' });
  expect(tile).toHaveProp('accessibilityHint', 'The price may be out of date.');
  expect(symbolNames(tile)).toEqual(['clock']);
  expect(within(tile).getByText('$36.96')).toHaveStyle({ color: textPrice });
});

test('the binder grid shows the newest addition first', async () => {
  ownCollectionCopies([...collectionEntryCopies('Ribbons of Night', 1), ...collectionEntryCopies('Angelic Curator', 1)]);

  const collection = await openCollection();

  expect(
    appearsBefore(
      collection.getByRole('button', { name: /^Ribbons of Night/ }),
      collection.getByRole('button', { name: /^Angelic Curator/ }),
    ),
  ).toBe(true);
});

test('the binder grid loads more tiles as the user scrolls', async () => {
  ownCollectionCopies(Array.from({ length: 70 }, (_, index) => collectionEntryCopies(`Card ${index + 1}`, 1)).flat());
  const collection = await openCollection();
  expect(collection.queryByRole('button', { name: /^Card 70,/ })).not.toBeOnTheScreen();

  await scrollToEnd(selectedTab());

  expect(await collection.findByRole('button', { name: /^Card 70,/ })).toBeOnTheScreen();
});

test('when its cursor has expired, the binder grid starts its read again, so scrolling loads more tiles', async () => {
  ownCollectionCopies(Array.from({ length: 70 }, (_, index) => collectionEntryCopies(`Card ${index + 1}`, 1)).flat());
  const collection = await openCollection();
  expireCollectionSearchCursors();

  await scrollToEnd(selectedTab());
  await scrollToEnd(selectedTab());

  expect(await collection.findByRole('button', { name: /^Card 70,/ })).toBeOnTheScreen();
});

test('the Collection tab shows newly added copies when it gains focus again', async () => {
  const curator = collectionEntryCopies('Angelic Curator', 1);
  ownCollectionCopies(curator);
  const collection = await openCollection();
  expect(collection.getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();

  ownCollectionCopies([...collectionEntryCopies('Ribbons of Night', 1), ...curator]);
  await pressTab('Recent');
  await pressTab('Collection');

  expect(await within(selectedTab()).findByRole('button', { name: /^Ribbons of Night/ })).toBeOnTheScreen();
});

test('a failed binder grid read offers Try again, which shows the tiles', async () => {
  ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
  failCollectionReads(1);

  const collection = await openCollection();
  expect(collection.getByText('Could not load your collection')).toBeOnTheScreen();

  await fireEvent.press(collection.getByRole('button', { name: 'Try again' }));

  expect(await within(selectedTab()).findByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  expect(screen.queryByText('Could not load your collection')).not.toBeOnTheScreen();
});

describe('the skeleton grid', () => {
  test('until the binder grid read returns, the Collection tab shows a skeleton grid, then the tiles', async () => {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 2));
    const reads = holdCollectionReads();

    const collection = await openCollection();
    expect(skeletonGrid()).toBeOnTheScreen();
    expect(collection.queryByRole('image')).not.toBeOnTheScreen();

    await reads.finish();

    expect(await collection.findAllByRole('image', { name: /^Angelic Curator/ })).toHaveLength(2);
    expect(skeletonGrid()).not.toBeOnTheScreen();
  });

  test('VoiceOver reads the skeleton grid as one element and not each block', async () => {
    holdCollectionReads();

    await openCollection();

    expect(skeletonGrid()).toHaveProp('accessible', true);
    expect(within(skeletonGrid()!).queryAllByLabelText(/./)).toEqual([]);
  });

  test('an empty collection shows the skeleton grid, then the empty state', async () => {
    const reads = holdCollectionReads();

    const collection = await openCollection();
    expect(skeletonGrid()).toBeOnTheScreen();
    expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();

    await reads.finish();

    expect(await collection.findByText('Your collection is empty')).toBeOnTheScreen();
    expect(skeletonGrid()).not.toBeOnTheScreen();
  });

  test('a failed binder grid read shows the skeleton grid, then Try again', async () => {
    failCollectionReads(1);
    const reads = holdCollectionReads();

    const collection = await openCollection();
    expect(skeletonGrid()).toBeOnTheScreen();

    await reads.finish();

    expect(await collection.findByText('Could not load your collection')).toBeOnTheScreen();
    expect(skeletonGrid()).not.toBeOnTheScreen();
  });

  test('a reload when the tab gains focus keeps the tiles already shown and brings no skeleton grid back', async () => {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    const collection = await openCollection();
    const reads = holdCollectionReads();

    await pressTab('Recent');
    await pressTab('Collection');

    expect(within(selectedTab()).getByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();
    expect(skeletonGrid()).not.toBeOnTheScreen();
    await reads.finish();
    expect(collection.getByRole('image', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('a new page keeps the tiles already shown and brings no skeleton grid back', async () => {
    ownCollectionCopies(Array.from({ length: 70 }, (_, index) => collectionEntryCopies(`Card ${index + 1}`, 1)).flat());
    const collection = await openCollection();
    const reads = holdCollectionReads();

    await scrollToEnd(selectedTab());

    expect(collection.getByRole('image', { name: /^Card 1,/ })).toBeOnTheScreen();
    expect(skeletonGrid()).not.toBeOnTheScreen();
    await reads.finish();
    expect(await collection.findByRole('image', { name: /^Card 70,/ })).toBeOnTheScreen();
  });
});

describe('the collection total button', () => {
  function collectionTotal(changes: Partial<CollectionTotal> = {}): CollectionTotal {
    return {
      total: '2419.59',
      currency: 'USD',
      priced_copies: 26,
      copies: 27,
      change: '12.40',
      ...changes,
    };
  }

  async function openCollectionWithTotal(total: CollectionTotal) {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    ownCollectionTotal(total);
    await openCollection();
    return selectedTab();
  }

  test('the collection total button sits in the header before the settings button and shows the collection total', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    expect(tabHeader(collection).buttons).toEqual(['Collection total, $2,419.59', 'Settings']);
    expect(headerButton(collection, 'Collection total, $2,419.59')).toEqual({
      type: 'menu',
      label: '$2,419.59',
      symbol: undefined,
      hint: 'up $12.40 since yesterday, 26 of 27 cards priced',
    });
  });

  test('the collection total button opens a menu with the change since yesterday, the coverage, and the price source', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    expect(headerMenu(collection, 'Collection total, $2,419.59')).toEqual({
      title: 'Current prices from Scryfall, in USD',
      items: [
        { title: '+$12.40', subtitle: 'Since yesterday' },
        { title: '26 of 27 cards', subtitle: 'Priced' },
      ],
    });
  });

  test('the rows of the collection total menu show information and are not actions', async () => {
    const collection = await openCollectionWithTotal(collectionTotal());

    expect(pressableMenuRows(collection, 'Collection total, $2,419.59')).toEqual([]);
  });

  test('a falling collection total shows the minus sign, and VoiceOver hears down', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ total: '2368.44', change: '-38.75' }));

    expect(headerButton(collection, 'Collection total, $2,368.44').hint).toBe('down $38.75 since yesterday, 26 of 27 cards priced');
    expect(headerMenu(collection, 'Collection total, $2,368.44').items[0]).toEqual({ title: '\u2212$38.75', subtitle: 'Since yesterday' });
  });

  test('an unchanged collection total shows the change with no sign', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ change: '0.00' }));

    expect(headerButton(collection, 'Collection total, $2,419.59').hint).toBe('no change since yesterday, 26 of 27 cards priced');
    expect(headerMenu(collection, 'Collection total, $2,419.59').items[0]).toEqual({ title: '$0.00', subtitle: 'Since yesterday' });
  });

  test('with no daily collection total from yesterday, the change is a dash, and VoiceOver hears that it is not known yet', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ change: null }));

    expect(headerButton(collection, 'Collection total, $2,419.59').hint).toBe(
      'change since yesterday not known yet, 26 of 27 cards priced',
    );
    expect(headerMenu(collection, 'Collection total, $2,419.59').items[0]).toEqual({ title: '–', subtitle: 'Since yesterday' });
  });

  test('a long collection total and a large collection show in full', async () => {
    const collection = await openCollectionWithTotal(
      collectionTotal({ total: '128406.92', priced_copies: 1262, copies: 1284, change: '412.60' }),
    );

    expect(headerButton(collection, 'Collection total, $128,406.92').label).toBe('$128,406.92');
    expect(headerMenu(collection, 'Collection total, $128,406.92').items).toEqual([
      { title: '+$412.60', subtitle: 'Since yesterday' },
      { title: '1,262 of 1,284 cards', subtitle: 'Priced' },
    ]);
  });

  test('a EUR collection total shows in euros and names EUR as the price currency', async () => {
    const collection = await openCollectionWithTotal(collectionTotal({ total: '2096.10', currency: 'EUR', change: '10.85' }));

    expect(headerMenu(collection, 'Collection total, €2,096.10')).toEqual({
      title: 'Current prices from Scryfall, in EUR',
      items: [
        { title: '+€10.85', subtitle: 'Since yesterday' },
        { title: '26 of 27 cards', subtitle: 'Priced' },
      ],
    });
  });

  test('with no collection entries, the header shows no collection total button', async () => {
    await openCollection();

    expect(tabHeader(selectedTab()).buttons).toEqual(['Settings']);
  });

  test('the collection total reloads when the Collection tab gains focus again', async () => {
    await openCollectionWithTotal(collectionTotal());

    ownCollectionTotal(collectionTotal({ total: '2420.80', copies: 28, priced_copies: 27 }));
    await pressTab('Recent');
    await pressTab('Collection');

    await waitFor(() => expect(tabHeader(selectedTab()).buttons).toEqual(['Collection total, $2,420.80', 'Settings']));
  });
});

describe('collection search', () => {
  function lastSearch() {
    return collectionSearchesSent().at(-1);
  }

  function chipButton(label: string) {
    return within(selectedTab()).getByRole('button', { name: label });
  }

  function chipLabels() {
    return within(selectedTab())
      .queryAllByRole('button')
      .filter((button) => button.props.accessibilityHint === 'Removes this chip.')
      .map((button) => button.props.accessibilityLabel);
  }

  test('the native search bar sits under the large title, with the placeholder "Search your collection"', async () => {
    await openCollection();

    expect(tabSearchBar(selectedTab())).toEqual({
      placeholder: 'Search your collection',
      placement: 'stacked',
      hidesWhenScrolling: false,
    });
  });

  test('a plain binder read sends no text and no chips', async () => {
    await openCollection();

    expect(lastSearch()).toEqual({});
  });

  test('typed text searches the collection', async () => {
    await openCollection();

    await typeInSearchBar('angel');

    expect(lastSearch()).toEqual({ text: 'angel' });
  });

  test('a space turns typed key:value text into a chip, and the app sends it in the typed query', async () => {
    await openCollection();

    await typeInSearchBar('set:mh2 ');

    expect(chipLabels()).toEqual(['set:mh2']);
    expect(shownSearchText()).toBe('');
    expect(lastSearch()).toEqual({ sets: ['mh2'] });
  });

  test('Enter turns typed key:value text into a chip', async () => {
    await openCollection();

    await typeInSearchBar('angel finish:foil');
    await pressSearchKey();

    expect(chipLabels()).toEqual(['finish:foil']);
    expect(shownSearchText()).toBe('angel ');
    expect(lastSearch()).toEqual({ text: 'angel', finishes: ['foil'] });
  });

  test('a leading minus negates a chip, and a value with spaces is quoted', async () => {
    await openCollection();

    await typeInSearchBar('-name:"sol ring" ');

    expect(chipLabels()).toEqual(['-name:"sol ring"']);
    expect(lastSearch()).toEqual({ names_exclude: ['sol ring'] });
  });

  test('text and chips of every kind make one typed query', async () => {
    await openCollection();

    await typeInSearchBar(
      'angel type:creature color:wu identity:wub mv<4 pow>=2 tou=3 price>2.5 tag:ramp keyword:flying -rarity:common condition:lp lang:ja is:commander -is:gamechanger is:free -is:protected ',
    );

    expect(lastSearch()).toEqual({
      text: 'angel',
      types: ['creature'],
      colors: ['W', 'U'],
      identity_subset_of: ['W', 'U', 'B'],
      mana_value_max: 3,
      power_min: 2,
      toughness_min: 3,
      toughness_max: 3,
      price_min: '2.51',
      tags: ['ramp'],
      keywords: ['flying'],
      rarities_exclude: ['common'],
      conditions: ['lightly_played'],
      languages: ['ja'],
      is_commander: true,
      is_game_changer: false,
      is_free: true,
      is_protected: false,
    });
  });

  test('a key:value word still being typed is not sent as text', async () => {
    await openCollection();

    await typeInSearchBar('angel set:m');

    expect(lastSearch()).toEqual({ text: 'angel' });
  });

  test('identity:c searches for a colorless color identity', async () => {
    await openCollection();

    await typeInSearchBar('identity:c ');

    expect(lastSearch()).toEqual({ identity_subset_of: [] });
  });

  test('an unknown key stays as text', async () => {
    await openCollection();

    await typeInSearchBar('foo:bar ');

    expect(chipLabels()).toEqual([]);
    expect(lastSearch()).toEqual({ text: 'foo:bar' });
  });

  test('with no key typed, suggestions offer keys and replace the grid', async () => {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    const collection = await openCollection();

    await typeInSearchBar('s');

    expect(collection.getByRole('button', { name: 'set:, Set code' })).toBeOnTheScreen();
    expect(collection.queryByRole('button', { name: /^Angelic Curator/ })).not.toBeOnTheScreen();
  });

  test('a picked key goes into the search bar, and suggestions then offer its values', async () => {
    const collection = await openCollection();

    await typeInSearchBar('fin');
    await fireEvent.press(collection.getByRole('button', { name: 'finish:, Finish' }));

    expect(shownSearchText()).toBe('finish:');
    expect(lastSearch()).toEqual({});
    expect(collection.getByRole('button', { name: 'finish:foil' })).toBeOnTheScreen();
    expect(collection.getByRole('button', { name: 'finish:etched' })).toBeOnTheScreen();
  });

  test('a picked suggestion turns into a chip', async () => {
    const collection = await openCollection();

    await typeInSearchBar('angel -finish:f');
    await fireEvent.press(collection.getByRole('button', { name: '-finish:foil' }));

    expect(chipLabels()).toEqual(['-finish:foil']);
    expect(shownSearchText()).toBe('angel ');
    expect(lastSearch()).toEqual({ text: 'angel', finishes_exclude: ['foil'] });
  });

  test.each([
    ['condition:l', 'condition:lp, Lightly played'],
    ['lang:j', 'lang:ja, Japanese'],
    ['rarity:m', 'rarity:mythic'],
    ['color:u', 'color:u, Blue'],
    ['is:p', 'is:protected, Protected copies'],
  ])('after %s, suggestions offer values from the fixed list', async (typed, suggestion) => {
    const collection = await openCollection();

    await typeInSearchBar(typed);

    expect(collection.getByRole('button', { name: suggestion })).toBeOnTheScreen();
  });

  test('after set:, suggestions offer set codes from the card catalog', async () => {
    const collection = await openCollection();

    await typeInSearchBar('set:mh');

    expect(await collection.findByRole('button', { name: 'set:mh2, Modern Horizons 2' })).toBeOnTheScreen();
    expect(collection.getByRole('button', { name: 'set:mh3, Modern Horizons 3' })).toBeOnTheScreen();
    expect(collection.queryByRole('button', { name: /^set:m10/ })).not.toBeOnTheScreen();
  });

  test('after tag:, suggestions offer Oracle tags from the tag lookup', async () => {
    const collection = await openCollection();

    await typeInSearchBar('tag:ram');
    await fireEvent.press(await collection.findByRole('button', { name: 'tag:ramp, Ramp' }));

    expect(chipLabels()).toEqual(['tag:ramp']);
    expect(lastSearch()).toEqual({ tags: ['ramp'] });
  });

  test('Enter closes the suggestions and shows the results', async () => {
    ownCollectionCopies(collectionEntryCopies('Sol Ring', 1));
    const collection = await openCollection();

    await typeInSearchBar('s');
    await pressSearchKey();

    expect(collection.queryByRole('button', { name: 'set:, Set code' })).not.toBeOnTheScreen();
    expect(collection.getByRole('button', { name: /^Sol Ring/ })).toBeOnTheScreen();
    expect(lastSearch()).toEqual({ text: 's' });
  });

  test('the × on a chip removes it', async () => {
    await openCollection();
    await typeInSearchBar('set:mh2 finish:foil ');

    await fireEvent.press(chipButton('set:mh2'));

    expect(chipLabels()).toEqual(['finish:foil']);
    expect(lastSearch()).toEqual({ finishes: ['foil'] });
  });

  test('Backspace deletes typed text first, then removes the last chip in an empty field', async () => {
    await openCollection();
    await typeInSearchBar('set:mh2 finish:foil ab');

    await pressBackspaceInSearchBar();
    await pressBackspaceInSearchBar();
    expect(chipLabels()).toEqual(['set:mh2', 'finish:foil']);

    await pressBackspaceInSearchBar();
    expect(chipLabels()).toEqual(['set:mh2']);
    expect(lastSearch()).toEqual({ sets: ['mh2'] });

    await pressBackspaceInSearchBar();
    expect(chipLabels()).toEqual([]);
    expect(lastSearch()).toEqual({});
  });

  test('Cancel clears the text and the chips and shows the whole binder again', async () => {
    ownCollectionCopies([...collectionEntryCopies('Angelic Curator', 1), ...collectionEntryCopies('Sol Ring', 1)]);
    answerCollectionSearches((query) => (query.text ? [] : collectionEntryCopies('Angelic Curator', 1)));
    const collection = await openCollection();
    await typeInSearchBar('set:mh2 ring');

    await pressSearchCancel();

    expect(chipLabels()).toEqual([]);
    expect(lastSearch()).toEqual({});
    expect(await collection.findByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('results show as binder tiles, one per copy, under a count line', async () => {
    ownCollectionCopies(collectionEntryCopies('Ponder', 27));
    ownCollectionTotal({ total: '27.00', currency: 'USD', priced_copies: 27, copies: 27, change: null });
    const curators = collectionEntryCopies('Angelic Curator', 6);
    answerCollectionSearches((query) => (query.text === 'curator' ? curators : collectionEntryCopies('Ponder', 27)));
    const collection = await openCollection();
    expect(collection.queryByText(/ of 27 copies$/)).not.toBeOnTheScreen();

    await typeInSearchBar('curator');

    expect(collection.getAllByRole('button', { name: /^Angelic Curator/ })).toHaveLength(6);
    expect(collection.getByText('6 of 27 copies')).toHaveStyle({ color: textMuted });
    expect(collection.queryByRole('button', { name: /^Ponder/ })).not.toBeOnTheScreen();
  });

  test('a new search shows the skeleton grid in place of the tiles until its results arrive', async () => {
    ownCollectionCopies(collectionEntryCopies('Ponder', 3));
    answerCollectionSearches((query) => (query.text === 'curator' ? collectionEntryCopies('Angelic Curator', 2) : collectionEntryCopies('Ponder', 3)));
    const collection = await openCollection();
    const reads = holdCollectionReads();

    await typeInSearchBar('curator');

    expect(skeletonGrid()).toBeOnTheScreen();
    expect(collection.queryByRole('image', { name: /^Ponder/ })).not.toBeOnTheScreen();

    await reads.finish();

    expect(await collection.findAllByRole('image', { name: /^Angelic Curator/ })).toHaveLength(2);
    expect(skeletonGrid()).not.toBeOnTheScreen();
  });

  test('a search with no results shows "No cards found."', async () => {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    answerCollectionSearches((query) => (query.text ? [] : collectionEntryCopies('Angelic Curator', 1)));
    const collection = await openCollection();

    await typeInSearchBar('dragon');

    expect(collection.getByText('No cards found.')).toBeOnTheScreen();
    expect(collection.queryByText('Your collection is empty')).not.toBeOnTheScreen();
  });

  test.each([
    ['set:zzz', 'sets[0]', 'No set named "zzz".'],
    ['tag:zzz', 'tags[0]', 'No Oracle tag named "zzz".'],
  ])('a %s chip that the server refuses turns danger, and the grid shows its message', async (typed, field, message) => {
    ownCollectionCopies(collectionEntryCopies('Angelic Curator', 1));
    answerCollectionSearches((query) => (query.sets || query.tags ? { refusedField: field } : collectionEntryCopies('Angelic Curator', 1)));
    const collection = await openCollection();

    await typeInSearchBar(`finish:foil ${typed} `);

    expect(collection.getByText(message)).toBeOnTheScreen();
    expect(within(chipButton(typed)).getByText(typed)).toHaveStyle({ color: danger });
    expect(within(chipButton('finish:foil')).getByText('finish:foil')).not.toHaveStyle({ color: danger });
    expect(collection.queryByRole('button', { name: /^Angelic Curator/ })).not.toBeOnTheScreen();
  });
});

describe('the sort button', () => {
  function lastSearch() {
    return collectionSearchesSent().at(-1);
  }

  function sortButton(name: string) {
    return menuButton(selectedTab(), name);
  }

  test('the sort button opens a native menu titled "Sort by", and Relevance has the check mark', async () => {
    await openCollection();

    expect(buttonMenu(sortButton('Sort, Relevance'))).toEqual({
      title: 'Sort by',
      items: [
        { title: 'Relevance', checked: true, symbol: undefined },
        { title: 'Recently added', checked: false, symbol: undefined },
        { title: 'Name', checked: false, symbol: undefined },
        { title: 'Price', checked: false, symbol: undefined },
        { title: 'Mana value', checked: false, symbol: undefined },
        { title: 'Release date', checked: false, symbol: undefined },
      ],
    });
    expect(lastSearch()).toEqual({});
  });

  test.each([
    ['Recently added', 'added', 'desc', 'Sort, Recently added, newest first'],
    ['Name', 'name', 'asc', 'Sort, Name, A to Z'],
    ['Price', 'price', 'desc', 'Sort, Price, high to low'],
    ['Mana value', 'mana_value', 'asc', 'Sort, Mana value, low to high'],
    ['Release date', 'release_date', 'desc', 'Sort, Release date, newest first'],
  ])('choosing %s sorts the collection in its first direction, and VoiceOver reads the sort and its direction', async (title, sort, order, spoken) => {
    await openCollection();

    await pressButtonMenuItem(sortButton('Sort, Relevance'), title);

    expect(lastSearch()).toEqual({ sort, sort_order: order });
    expect(buttonMenu(sortButton(spoken)).items.filter((item) => item.checked)).toEqual([
      { title, checked: true, symbol: order === 'desc' ? 'arrow.down' : 'arrow.up' },
    ]);
  });

  test('tapping the current sort again reverses it, and the arrow shows the new direction', async () => {
    await openCollection();
    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Price');

    await pressButtonMenuItem(sortButton('Sort, Price, high to low'), 'Price');

    expect(lastSearch()).toEqual({ sort: 'price', sort_order: 'asc' });
    expect(buttonMenu(sortButton('Sort, Price, low to high')).items[3]).toEqual({ title: 'Price', checked: true, symbol: 'arrow.up' });

    await pressButtonMenuItem(sortButton('Sort, Price, low to high'), 'Price');

    expect(lastSearch()).toEqual({ sort: 'price', sort_order: 'desc' });
  });

  test('Relevance has one direction, and choosing it again changes nothing', async () => {
    await openCollection();
    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Name');
    await pressButtonMenuItem(sortButton('Sort, Name, A to Z'), 'Relevance');
    expect(lastSearch()).toEqual({});

    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Relevance');

    expect(lastSearch()).toEqual({});
    expect(buttonMenu(sortButton('Sort, Relevance')).items[0]).toEqual({ title: 'Relevance', checked: true, symbol: undefined });
  });

  test('a new sort starts in its first direction, whatever the direction of the sort before', async () => {
    await openCollection();
    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Name');
    await pressButtonMenuItem(sortButton('Sort, Name, A to Z'), 'Name');

    await pressButtonMenuItem(sortButton('Sort, Name, Z to A'), 'Mana value');

    expect(lastSearch()).toEqual({ sort: 'mana_value', sort_order: 'asc' });
  });

  test('the symbol is arrow.up.arrow.down in the text color for Relevance and primary lime for any other sort', async () => {
    await openCollection();
    expect(symbolNames(sortButton('Sort, Relevance'))).toEqual(['arrow.up.arrow.down']);
    expect(symbolTintColor(sortButton('Sort, Relevance'))).toBe(text);

    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Recently added');

    expect(symbolTintColor(sortButton('Sort, Recently added, newest first'))).toBe(primary);
    expect(within(sortButton('Sort, Recently added, newest first')).queryAllByText(/./)).toEqual([]);
  });

  test('the sort applies to search results', async () => {
    await openCollection();
    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Price');

    await typeInSearchBar('angel');
    await pressSearchKey();

    expect(lastSearch()).toEqual({ text: 'angel', sort: 'price', sort_order: 'desc' });
  });

  test('the sort button hides while the user types and comes back after Enter', async () => {
    await openCollection();

    await typeInSearchBar('angel');
    expect(menuButtonNames(selectedTab())).toEqual([]);

    await pressSearchKey();
    expect(menuButtonNames(selectedTab())).toEqual(['Sort, Relevance']);
  });

  test('the sort stays when the Collection tab gains focus again', async () => {
    await openCollection();
    await pressButtonMenuItem(sortButton('Sort, Relevance'), 'Name');

    await pressTab('Recent');
    await pressTab('Collection');

    expect(menuButtonNames(selectedTab())).toEqual(['Sort, Name, A to Z']);
    expect(lastSearch()).toEqual({ sort: 'name', sort_order: 'asc' });
  });
});
