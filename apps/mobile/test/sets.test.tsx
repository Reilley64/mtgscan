import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import type { CardSet } from '@mtgscan/supabase/sets';
import { fireEvent, within } from 'expo-router/testing-library';
import { processColor } from 'react-native';

import { liquidGlassIsAvailable } from './fake-glass-effect';
import { offerSets, ownCollectionCopies, startSignedIn } from './fake-supabase';
import { fail, hold, requestsSent } from './fake-supabase-controls';
import {
  appearsBefore,
  backdropOf,
  clearSearchBar,
  glassEffect,
  imageSources,
  imageTintColors,
  pauseTyping,
  pressSearchCancel,
  pressSearchKey,
  pressTab,
  scrollToEnd,
  selectedTab,
  setArtLook,
  swipeBackInTheTab,
  symbolIn,
  symbolNames,
  symbolSizes,
  tabBarLabels,
  tabHeader,
  tabSearchBar,
  tabStackShowsBackButton,
  tabStackTopScreen,
  typeInSearchBar,
  typeInSearchBarWithoutPausing,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { line, primary, text } = tokenColors;

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

function setRow(code: string, name: string, owned: number, size: number, releasedAt = '2024-08-02'): CardSet {
  return {
    code,
    name,
    icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg`,
    released_at: releasedAt,
    set_art_uri: null,
    completion: { any: { owned, size }, nonfoil: { owned, size }, foil: { owned, size } },
  };
}

function withSetArt(set: CardSet): CardSet {
  return { ...set, set_art_uri: `https://cards.scryfall.io/art_crop/front/${set.code}.jpg` };
}

async function openCollection() {
  await renderApp();
  await pressTab('Collection');
}

function setsButton() {
  return within(selectedTab()).queryByRole('button', { name: 'Sets' });
}

async function openSets() {
  await openCollection();
  await fireEvent.press(setsButton()!);
  return within(tabStackTopScreen());
}

beforeEach(() => {
  startSignedIn();
  ownCollectionCopies([curator]);
});

describe('the Sets button', () => {
  test('Collection has a round 48 px Liquid Glass Sets button with the stacked cards symbol', async () => {
    liquidGlassIsAvailable();

    await openCollection();

    const button = setsButton()!;
    const glass = backdropOf(symbolIn(button));
    expect(glassEffect(glass)).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
    expect(glass).toHaveStyle({ width: 48, height: 48, borderRadius: 999 });
    expect(symbolNames(button)).toEqual(['rectangle.portrait.on.rectangle.portrait']);
    expect(symbolSizes(button)).toEqual([18]);
  });

  test('the Sets button hides while the user types and comes back after Enter', async () => {
    await openCollection();

    await typeInSearchBar('angel');
    expect(setsButton()).toBeNull();

    await pressSearchKey();
    expect(setsButton()).toBeOnTheScreen();
  });

  test('the Sets button hides on an empty collection', async () => {
    ownCollectionCopies([]);

    await openCollection();

    expect(within(selectedTab()).getByText('Your collection is empty')).toBeOnTheScreen();
    expect(setsButton()).toBeNull();
  });
});

describe('opening Sets', () => {
  test('the Sets button opens Sets in the Collection tab, with a large title, a back button, and the tab bar', async () => {
    await openSets();

    expect(selectedTab().props.title).toBe('Collection');
    expect(tabHeader(tabStackTopScreen())).toMatchObject({ title: 'Sets', largeTitle: true });
    expect(tabStackShowsBackButton()).toBe(true);
    expect(tabBarLabels()).toEqual(['Recent', 'Collection', 'Decks', 'Scan']);
    expect(tabSearchBar(tabStackTopScreen())).toMatchObject({ placeholder: 'Search sets' });
  });

  test('the swipe from the left edge goes back to Collection', async () => {
    await openSets();

    await swipeBackInTheTab();

    expect(tabHeader(tabStackTopScreen()).title).toBe('Collection');
    expect(setsButton()).toBeOnTheScreen();
  });
});

describe('the set rows', () => {
  beforeEach(() => {
    offerSets([
      setRow('blb', 'Bloomburrow', 234, 261, '2024-08-02'),
      setRow('mh3', 'Modern Horizons 3', 303, 303, '2024-06-14'),
      setRow('lci', 'The Lost Caverns of Ixalan', 2, 3, '2023-11-17'),
      setRow('khm', 'Kaldheim', 0, 0, '2021-02-05'),
    ]);
  });

  test('each set is a button that VoiceOver reads with its name, set completion, and percentage, in the order of the read', async () => {
    const sets = await openSets();

    expect(sets.getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual([
      'Bloomburrow, 234 of 261, 89 percent',
      'Modern Horizons 3, 303 of 303, 100 percent',
      'The Lost Caverns of Ixalan, 2 of 3, 66 percent',
    ]);
  });

  test('a row shows the set name, "x of y", a lime progress bar, and the percentage rounded down', async () => {
    const sets = await openSets();

    const row = within(sets.getByRole('button', { name: /^The Lost Caverns of Ixalan/ }));
    expect(row.getByText('The Lost Caverns of Ixalan')).toBeOnTheScreen();
    expect(row.getByText('2 of 3')).toBeOnTheScreen();
    expect(row.getByText('66%')).toBeOnTheScreen();
    expect(row.getByRole('progressbar')).toHaveProp('accessibilityValue', { min: 0, max: 3, now: 2 });
  });

  test('a set with no set art shows its set symbol twice, in the line color and in lime over it', async () => {
    const sets = await openSets();

    const row = sets.getByRole('button', { name: /^Bloomburrow/ });
    expect(imageSources(row)).toEqual(['https://svgs.scryfall.io/sets/blb.svg', 'https://svgs.scryfall.io/sets/blb.svg']);
    expect(imageTintColors(row)).toEqual([processColor(line), processColor(primary)]);
  });

  test('a complete set has a lime outline and a check mark in place of the percentage', async () => {
    const sets = await openSets();

    const complete = sets.getByRole('button', { name: /^Modern Horizons 3/ });
    expect(complete).toHaveStyle({ borderColor: primary });
    expect(within(complete).getByText('✓')).toHaveStyle({ color: primary });
    expect(within(complete).queryByText('100%')).toBeNull();
    expect(sets.getByRole('button', { name: /^Bloomburrow/ })).toHaveStyle({ borderColor: '#00000000' });
    expect(sets.getByText('89%')).toHaveStyle({ color: text });
  });

  test('a set whose main set is empty is not shown', async () => {
    const sets = await openSets();

    expect(sets.queryByText('Kaldheim')).toBeNull();
  });
});

describe('the set art banners', () => {
  beforeEach(() => {
    offerSets([
      withSetArt(setRow('blb', 'Bloomburrow', 234, 261, '2024-08-02')),
      withSetArt(setRow('mh3', 'Modern Horizons 3', 303, 303, '2024-06-14')),
      withSetArt(setRow('lci', 'The Lost Caverns of Ixalan', 2, 3, '2023-11-17')),
      withSetArt(setRow('woe', 'Wilds of Eldraine', 0, 276, '2023-09-08')),
    ]);
  });

  function banner(name: string) {
    return within(tabStackTopScreen()).getByRole('button', { name: new RegExp(`^${name}`) });
  }

  test('a set with set art is a banner of its set art, in grayscale with the owned share in color and a lime line at its edge', async () => {
    await openSets();

    expect(setArtLook(banner('Bloomburrow'))).toEqual({
      uris: ['https://cards.scryfall.io/art_crop/front/blb.jpg', 'https://cards.scryfall.io/art_crop/front/blb.jpg'],
      grayscale: true,
      coloredShare: expect.closeTo(0.8966, 4),
      edgeLine: true,
    });
  });

  test('the colored share of the set art grows with set completion', async () => {
    await openSets();

    expect(setArtLook(banner('Wilds of Eldraine'))).toMatchObject({ coloredShare: 0, edgeLine: false });
    expect(setArtLook(banner('The Lost Caverns of Ixalan')).coloredShare).toBeCloseTo(0.6667, 4);
    expect(setArtLook(banner('Bloomburrow')).coloredShare).toBeCloseTo(0.8966, 4);
  });

  test('over the set art, a banner shows the set symbol in white, the set name, "x of y", and the percentage', async () => {
    await openSets();

    const row = banner('Bloomburrow');
    expect(within(row).getByText('Bloomburrow')).toBeOnTheScreen();
    expect(within(row).getByText('234 of 261')).toBeOnTheScreen();
    expect(within(row).getByText('89%')).toHaveStyle({ color: text });
    expect(imageSources(row)).toContain('https://svgs.scryfall.io/sets/blb.svg');
    expect(imageTintColors(row).filter(Boolean)).toEqual([processColor(text)]);
    expect(row).toHaveStyle({ minHeight: 92, borderColor: '#00000000' });
  });

  test('a complete set banner is all in color, with a lime outline, a check mark in place of the percentage, and no edge line', async () => {
    await openSets();

    const complete = banner('Modern Horizons 3');
    expect(setArtLook(complete)).toMatchObject({ coloredShare: 1, edgeLine: false });
    expect(complete).toHaveStyle({ borderColor: primary });
    expect(within(complete).getByText('✓')).toHaveStyle({ color: primary });
    expect(within(complete).queryByText('100%')).toBeNull();
  });

  test('a banner is read like a set row', async () => {
    const sets = await openSets();

    expect(sets.getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual([
      'Bloomburrow, 234 of 261, 89 percent',
      'Modern Horizons 3, 303 of 303, 100 percent',
      'The Lost Caverns of Ixalan, 2 of 3, 66 percent',
      'Wilds of Eldraine, 0 of 276, 0 percent',
    ]);
  });
});

describe('searching Sets', () => {
  beforeEach(() => {
    offerSets([setRow('blb', 'Bloomburrow', 234, 261), setRow('mh3', 'Modern Horizons 3', 1, 303)]);
  });

  function shownSets() {
    return within(tabStackTopScreen())
      .queryAllByRole('button')
      .map((row) => row.props.accessibilityLabel as string)
      .filter((label) => /percent$/.test(label));
  }

  test('the search matches the set name, ignoring case', async () => {
    await openSets();

    await typeInSearchBar('BLOOM');

    expect(shownSets()).toEqual(['Bloomburrow, 234 of 261, 89 percent']);
  });

  test('the search matches the set code, ignoring case', async () => {
    await openSets();

    await typeInSearchBar('Mh3');

    expect(shownSets()).toEqual(['Modern Horizons 3, 1 of 303, 0 percent']);
  });

  test('the search waits for a pause in typing, then reads Sets again from the first page once, for the final text', async () => {
    await openSets();

    await typeInSearchBarWithoutPausing('bloom');
    expect(requestsSent('list_sets')).toEqual([{ finish_view: 'any', cursor: null }]);

    await pauseTyping();
    expect(requestsSent('list_sets')).toEqual([
      { finish_view: 'any', cursor: null },
      { text: 'bloom', finish_view: 'any', cursor: null },
    ]);
  });

  test('clearing the search reads every set at once', async () => {
    await openSets();
    await typeInSearchBar('xyz');

    await clearSearchBar();

    expect(requestsSent('list_sets').at(-1)).toEqual({ finish_view: 'any', cursor: null });
    expect(shownSets()).toHaveLength(2);
  });

  test('a reply to an earlier search never replaces the reply to the latest search', async () => {
    const sets = await openSets();
    const earlierSearch = hold('list_sets');
    await typeInSearchBar('bloom');
    await clearSearchBar();
    const latestSearch = hold('list_sets');
    await typeInSearchBar('horizons');

    await latestSearch.finish();
    await earlierSearch.finish();

    expect(shownSets()).toEqual(['Modern Horizons 3, 1 of 303, 0 percent']);
    expect(sets.queryByRole('button', { name: /^Bloomburrow/ })).toBeNull();
  });

  test('a search that matches no set says so, and Cancel shows every set again', async () => {
    const sets = await openSets();

    await typeInSearchBar('xyz');
    expect(sets.getByLabelText('No sets match "xyz".')).toBeOnTheScreen();
    expect(shownSets()).toEqual([]);

    await pressSearchCancel();
    expect(shownSets()).toHaveLength(2);
  });
});

describe('the pages of Sets', () => {
  const manySets = Array.from({ length: 25 }, (_, index) => setRow(`s${index + 1}`, `Set ${index + 1}`, 1, 10));

  function shownSetNames() {
    return within(tabStackTopScreen())
      .queryAllByRole('button')
      .map((row) => row.props.accessibilityLabel as string)
      .filter((label) => /percent$/.test(label))
      .map((label) => label.split(',')[0]);
  }

  test('Sets reads the first page, then the next page as the user nears the end of the list', async () => {
    offerSets(manySets);
    await openSets();
    expect(requestsSent('list_sets')).toEqual([{ finish_view: 'any', cursor: null }]);

    await scrollToEnd(tabStackTopScreen());

    expect(await within(tabStackTopScreen()).findByRole('button', { name: /^Set 25,/ })).toBeOnTheScreen();
    expect(requestsSent('list_sets')).toEqual([
      { finish_view: 'any', cursor: null },
      { finish_view: 'any', cursor: '20' },
    ]);
  });

  test('while the next page loads, set banner skeletons show after the last set', async () => {
    offerSets(manySets);
    const sets = await openSets();
    const read = hold('list_sets');

    await scrollToEnd(tabStackTopScreen());

    const skeleton = sets.getByRole('progressbar', { name: 'Loading more sets' });
    expect(skeleton.children).toHaveLength(2);
    expect(appearsBefore(sets.getAllByRole('button', { name: /^Set \d+,/ }).at(-1)!, skeleton)).toBe(true);
    await read.finish();
    expect(sets.queryByRole('progressbar', { name: 'Loading more sets' })).toBeNull();
    await scrollToEnd(tabStackTopScreen());
    expect(sets.getByRole('button', { name: /^Set 25,/ })).toBeOnTheScreen();
  });

  test('a new search after the next page reads again from the first page', async () => {
    offerSets(manySets);
    await openSets();
    await scrollToEnd(tabStackTopScreen());
    await within(tabStackTopScreen()).findByRole('button', { name: /^Set 25,/ });

    await typeInSearchBar('set 2');

    expect(requestsSent('list_sets').at(-1)).toEqual({ text: 'set 2', finish_view: 'any', cursor: null });
    expect(shownSetNames()).toEqual(['Set 2', ...manySets.slice(19, 25).map((set) => set.name)]);
  });
});

describe('reading Sets', () => {
  test('Sets shows a skeleton while it loads', async () => {
    offerSets([setRow('blb', 'Bloomburrow', 234, 261)]);
    const read = hold('list_sets');

    const sets = await openSets();
    expect(sets.getByRole('progressbar', { name: 'Loading sets' }).children.length).toBeGreaterThan(8);

    await read.finish();
    expect(sets.queryByRole('progressbar', { name: 'Loading sets' })).toBeNull();
    expect(sets.getByRole('button', { name: /^Bloomburrow/ })).toBeOnTheScreen();
  });

  test('when the read fails, Sets shows the read failure, and Try again reads the sets again', async () => {
    offerSets([setRow('blb', 'Bloomburrow', 234, 261)]);
    fail('list_sets', 1);

    const sets = await openSets();
    expect(sets.getByLabelText('Could not load Sets, Check your connection.')).toBeOnTheScreen();

    await fireEvent.press(sets.getByRole('button', { name: 'Try again' }));

    expect(await sets.findByRole('button', { name: /^Bloomburrow/ })).toBeOnTheScreen();
  });

  test('Sets reads again when it gains focus', async () => {
    offerSets([setRow('blb', 'Bloomburrow', 0, 261)]);
    await openSets();
    expect(requestsSent('list_sets').length).toBe(1);

    offerSets([setRow('blb', 'Bloomburrow', 1, 261)]);
    await pressTab('Recent');
    await pressTab('Collection');

    expect(requestsSent('list_sets').length).toBe(2);
    expect(within(tabStackTopScreen()).getByRole('button', { name: 'Bloomburrow, 1 of 261, 0 percent' })).toBeOnTheScreen();
  });
});
