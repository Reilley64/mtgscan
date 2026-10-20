import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import type { CardSet, FinishView, SetCardPrinting, SetDetails } from '@mtgscan/supabase/sets';
import { fireEvent, within } from 'expo-router/testing-library';

import { offerSetPage, offerSets, ownCollectionCopies, startSignedIn } from './fake-supabase';
import { fail, hold, requestsSent } from './fake-supabase-controls';
import {
  cardImageLook,
  cardImageUri,
  imageSources,
  listCellWidth,
  setArtLook,
  pressTab,
  scrollTabStackScreenTo,
  selectedTab,
  swipeBackInTheTab,
  tabBarLabels,
  tabHeader,
  tabHeaderLook,
  tabStackShowsBackButton,
  tabStackTopScreen,
} from './native-ui';
import { renderApp } from './render-app';

const curator: CollectionCopyRow = {
  copy_id: 'copy-1',
  printing_id: 'printing-1',
  name: 'Angelic Curator',
  set: 'mh2',
  collector_number: '262',
  rarity: 'common',
  image_uris: ['https://cards.scryfall.io/normal/front/curator.jpg'],
  finish: 'nonfoil',
  condition: 'near_mint',
  language: 'en',
  protected: false,
  price: null,
  deck: null,
  held_for: null,
  created_at: '2026-10-12T12:00:00.000Z',
};

function printing(collectorNumber: string, name: string, counts: Record<FinishView, number | null>): SetCardPrinting {
  return {
    printing_id: `blb-${collectorNumber}`,
    name,
    collector_number: collectorNumber,
    image_uri: `https://cards.scryfall.io/normal/front/blb-${collectorNumber}.jpg`,
    finishes: counts.foil === null ? ['nonfoil'] : ['nonfoil', 'foil'],
    counts,
  };
}

const bloomburrowRow: CardSet = {
  code: 'blb',
  name: 'Bloomburrow',
  icon_svg_uri: 'https://svgs.scryfall.io/sets/blb.svg',
  released_at: '2024-08-02',
  set_art_uri: null,
  completion: { any: { owned: 2, size: 3 }, nonfoil: { owned: 1, size: 3 }, foil: { owned: 1, size: 3 } },
};

const bloomburrow: SetDetails = {
  ...bloomburrowRow,
  main_set: [
    printing('1', 'Banishing Light', { any: 1, nonfoil: 1, foil: 0 }),
    printing('2', 'Beza, the Bounding Spring', { any: 2, nonfoil: 0, foil: 2 }),
    printing('10', 'Dewdrop Cure', { any: 0, nonfoil: 0, foil: 0 }),
  ],
  variants: {
    completion: { any: { owned: 1, size: 2 }, nonfoil: { owned: 1, size: 2 }, foil: { owned: 0, size: 2 } },
    card_printings: [
      printing('282', 'Season of the Burrow', { any: 0, nonfoil: 0, foil: 0 }),
      printing('287', 'Beza, the Bounding Spring', { any: 3, nonfoil: 3, foil: 0 }),
    ],
  },
};

const noSet = { owned: 0, size: 0 };

const noVariants: SetDetails = {
  ...bloomburrow,
  variants: { completion: { any: noSet, nonfoil: noSet, foil: noSet }, card_printings: [] },
};

function tiles() {
  return within(tabStackTopScreen()).queryAllByRole('image');
}

function tile(name: string) {
  return within(tabStackTopScreen()).getByRole('image', { name });
}

async function openBloomburrow() {
  await renderApp();
  await pressTab('Collection');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'Sets' }));
  await fireEvent.press(within(tabStackTopScreen()).getByRole('button', { name: /^Bloomburrow/ }));
  return within(tabStackTopScreen());
}

beforeEach(() => {
  startSignedIn();
  ownCollectionCopies([curator]);
  offerSets([bloomburrowRow]);
  offerSetPage(bloomburrow);
});

describe('opening a set', () => {
  test('tapping a set on Sets opens its set page in the Collection tab, with a back button and the tab bar', async () => {
    await openBloomburrow();

    expect(requestsSent('get_set')).toEqual([{ code: 'blb' }]);
    expect(selectedTab().props.title).toBe('Collection');
    expect(tabHeader(tabStackTopScreen())).toMatchObject({ title: '', largeTitle: false });
    expect(tabStackShowsBackButton()).toBe(true);
    expect(tabBarLabels()).toEqual(['Recent', 'Collection', 'Decks', 'Scan']);
  });

  test('the header has no line under it, and the cards scroll under it', async () => {
    await openBloomburrow();

    expect(tabHeaderLook(tabStackTopScreen())).toEqual({ backgroundColor: 'transparent', line: false, contentUnder: true });
  });

  test('the set name becomes the header title once the banner scrolls under the header, and goes again when it scrolls back', async () => {
    const page = await openBloomburrow();
    const banner = page.getByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' }).parent!;
    await fireEvent(banner, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 300 } } });
    expect(tabHeader(tabStackTopScreen()).title).toBe('');

    await scrollTabStackScreenTo(100);
    expect(tabHeader(tabStackTopScreen()).title).toBe('');

    await scrollTabStackScreenTo(300);
    expect(tabHeader(tabStackTopScreen()).title).toBe('Bloomburrow');

    await scrollTabStackScreenTo(0);
    expect(tabHeader(tabStackTopScreen()).title).toBe('');
  });

  test('the swipe from the left edge goes back to Sets', async () => {
    await openBloomburrow();

    await swipeBackInTheTab();

    expect(tabHeader(tabStackTopScreen()).title).toBe('Sets');
  });
});

describe('the set page', () => {
  test('the header is a larger banner of the set art, with the set symbol in white, the set name, "x of y", and the percentage, read as one heading', async () => {
    const art = 'https://cards.scryfall.io/art_crop/front/blb.jpg';
    offerSetPage({ ...bloomburrow, set_art_uri: art });

    const page = await openBloomburrow();

    const header = page.getByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' });
    expect(header).toHaveStyle({ minHeight: 150 });
    expect(setArtLook(header)).toEqual({ uris: [art, art], grayscale: true, coloredShare: expect.closeTo(0.6667, 4), edgeLine: true });
    expect(within(header).getByText('Bloomburrow')).toBeOnTheScreen();
    expect(within(header).getByText('2 of 3')).toBeOnTheScreen();
    expect(within(header).getByText('66%')).toBeOnTheScreen();
    expect(imageSources(header)).toContain('https://svgs.scryfall.io/sets/blb.svg');
  });

  test('with no set art, the header shows the set symbol filling up, the set name, "x of y", and the percentage, read as one heading', async () => {
    const page = await openBloomburrow();

    const header = page.getByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' });
    expect(within(header).getByText('Bloomburrow')).toBeOnTheScreen();
    expect(within(header).getByText('2 of 3')).toBeOnTheScreen();
    expect(within(header).getByText('66%')).toBeOnTheScreen();
    expect(imageSources(header)).toEqual(['https://svgs.scryfall.io/sets/blb.svg', 'https://svgs.scryfall.io/sets/blb.svg']);
  });

  test('the main set and then the variants show as card images in collector number order, read with their number and whether they are owned', async () => {
    await openBloomburrow();

    expect(tiles().map((card) => card.props.accessibilityLabel)).toEqual([
      'Banishing Light, number 1, owned',
      'Beza, the Bounding Spring, number 2, owned, 2 copies',
      'Dewdrop Cure, number 10, not owned',
      'Season of the Burrow, number 282, not owned',
      'Beza, the Bounding Spring, number 287, owned, 3 copies',
    ]);
    expect(cardImageUri(tile('Dewdrop Cure, number 10, not owned'))).toBe('https://cards.scryfall.io/normal/front/blb-10.jpg');
  });

  test('an owned card printing is lit, and one the user does not own is dimmed in grayscale', async () => {
    await openBloomburrow();

    expect(cardImageLook(tile('Banishing Light, number 1, owned'))).toEqual({ opacity: 1, grayscale: false });
    expect(cardImageLook(tile('Dewdrop Cure, number 10, not owned'))).toEqual({ opacity: expect.closeTo(0.38), grayscale: true });
  });

  test('a lit card shows its number of copies at its top left from 2 copies', async () => {
    await openBloomburrow();

    expect(within(tile('Banishing Light, number 1, owned')).queryByText('1')).toBeNull();
    expect(within(tile('Beza, the Bounding Spring, number 2, owned, 2 copies')).getByText('2')).toBeOnTheScreen();
  });

  test('the Variants section has its own heading with "x of y"', async () => {
    const page = await openBloomburrow();

    const heading = page.getByRole('header', { name: 'Variants, 1 of 2' });
    expect(within(heading).getByText('Variants')).toBeOnTheScreen();
    expect(within(heading).getByText('1 of 2')).toBeOnTheScreen();
  });

  test('the Variants heading spans the full row, and each card takes a third of it', async () => {
    const page = await openBloomburrow();

    const rowWidth = listCellWidth(page.getByRole('header', { name: 'Variants, 1 of 2' }));
    expect(listCellWidth(tile('Banishing Light, number 1, owned'))).toBe(rowWidth / 3);
  });

  test('a set with no variants has no Variants section', async () => {
    offerSetPage(noVariants);

    const page = await openBloomburrow();

    expect(page.queryByText('Variants')).toBeNull();
    expect(tiles()).toHaveLength(3);
  });

  test('cards are images, not buttons, and tapping one does nothing', async () => {
    const page = await openBloomburrow();

    expect(page.queryAllByRole('button')).toEqual([]);
    await fireEvent.press(tile('Banishing Light, number 1, owned'));
    expect(page.getByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' })).toBeOnTheScreen();
  });

  test('the set page shows no prices', async () => {
    const page = await openBloomburrow();

    expect(page.queryByText(/\$/)).toBeNull();
  });
});

describe('reading a set', () => {
  test('the set page shows a skeleton with a set page banner skeleton while it loads', async () => {
    const read = hold('get_set');

    const page = await openBloomburrow();
    const skeleton = page.getByRole('progressbar', { name: 'Loading set' });
    const [banner] = skeleton.children as ReturnType<typeof page.getByRole>[];
    expect(banner).toHaveStyle({ minHeight: 150, borderRadius: 12 });
    expect(tiles()).toEqual([]);

    await read.finish();
    expect(page.queryByRole('progressbar', { name: 'Loading set' })).toBeNull();
    expect(tiles()).toHaveLength(5);
  });

  test('when the read fails, the set page shows the read failure, and Try again reads the set again', async () => {
    fail('get_set', 1);

    const page = await openBloomburrow();
    expect(page.getByLabelText('Could not load this set, Check your connection.')).toBeOnTheScreen();

    await fireEvent.press(page.getByRole('button', { name: 'Try again' }));

    expect(await page.findByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' })).toBeOnTheScreen();
    expect(requestsSent('get_set')).toEqual([{ code: 'blb' }, { code: 'blb' }]);
  });

  test('going back to Sets reads the sets again', async () => {
    await openBloomburrow();

    offerSets([{ ...bloomburrowRow, completion: { ...bloomburrowRow.completion, any: { owned: 3, size: 3 } } }]);
    await swipeBackInTheTab();

    expect(await within(tabStackTopScreen()).findByRole('button', { name: 'Bloomburrow, 3 of 3, 100 percent' })).toBeOnTheScreen();
  });

  test('reopening a set page shows the set from the last visit at once, then reads it again', async () => {
    await openBloomburrow();
    await swipeBackInTheTab();
    offerSetPage({ ...bloomburrow, completion: { ...bloomburrow.completion, any: { owned: 3, size: 3 } } });
    const read = hold('get_set');

    await fireEvent.press(within(tabStackTopScreen()).getByRole('button', { name: /^Bloomburrow/ }));

    const page = within(tabStackTopScreen());
    expect(page.getByRole('header', { name: 'Bloomburrow, 2 of 3, 66 percent' })).toBeOnTheScreen();
    expect(page.queryByRole('progressbar', { name: 'Loading set' })).toBeNull();
    await read.finish();
    expect(page.getByRole('header', { name: 'Bloomburrow, 3 of 3, 100 percent' })).toBeOnTheScreen();
    expect(requestsSent('get_set')).toEqual([{ code: 'blb' }, { code: 'blb' }]);
  });

  test('the set page reads again when it gains focus', async () => {
    await openBloomburrow();

    offerSetPage({ ...bloomburrow, completion: { ...bloomburrow.completion, any: { owned: 3, size: 3 } } });
    await pressTab('Recent');
    await pressTab('Collection');

    expect(requestsSent('get_set')).toEqual([{ code: 'blb' }, { code: 'blb' }]);
    expect(within(tabStackTopScreen()).getByRole('header', { name: 'Bloomburrow, 3 of 3, 100 percent' })).toBeOnTheScreen();
  });
});
