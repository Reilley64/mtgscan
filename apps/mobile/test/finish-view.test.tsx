import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import type { CardSet, FinishView, SetCardPrinting, SetCompletion, SetDetails } from '@mtgscan/supabase/sets';
import { fireEvent, within } from 'expo-router/testing-library';

import { offerSetPage, offerSets, ownCollectionCopies, startSignedIn } from './fake-supabase';
import { requestsSent } from './fake-supabase-controls';
import {
  appearsBefore,
  cardImageLook,
  cardSheen,
  pressTab,
  selectedTab,
  setArtLook,
  setSymbolFillShare,
  swipeBackInTheTab,
  tabStackTopScreen,
} from './native-ui';
import { renderApp, restartTheApp } from './render-app';

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
  set_art_uri: 'https://cards.scryfall.io/art_crop/front/blb.jpg',
  completion: { any: { owned: 2, size: 3 }, nonfoil: { owned: 1, size: 3 }, foil: { owned: 1, size: 3 } },
};

const alphaRow: CardSet = {
  code: 'lea',
  name: 'Limited Edition Alpha',
  icon_svg_uri: 'https://svgs.scryfall.io/sets/lea.svg',
  released_at: '1993-08-05',
  set_art_uri: null,
  completion: { any: { owned: 1, size: 5 }, nonfoil: { owned: 1, size: 5 }, foil: { owned: 0, size: 0 } },
};

const noSet = { owned: 0, size: 0 };

function completion(any: SetCompletion, nonfoil: SetCompletion, foil: SetCompletion) {
  return { any, nonfoil, foil };
}

const noOther = { completion: completion(noSet, noSet, noSet), card_printings: [] };

const alpha: SetDetails = {
  ...alphaRow,
  sections: [],
  other: {
    completion: completion({ owned: 1, size: 1 }, { owned: 1, size: 1 }, noSet),
    card_printings: [printing('1', 'Animate Wall', { any: 1, nonfoil: 1, foil: null })],
  },
};

const draftCards = {
  name: 'Draft Cards',
  completion: completion({ owned: 2, size: 3 }, { owned: 1, size: 3 }, { owned: 1, size: 3 }),
  card_printings: [
    printing('1', 'Banishing Light', { any: 1, nonfoil: 1, foil: 0 }),
    printing('2', 'Beza, the Bounding Spring', { any: 2, nonfoil: 0, foil: 2 }),
    printing('10', 'Dewdrop Cure', { any: 0, nonfoil: 0, foil: 0 }),
  ],
};

const bloomburrow: SetDetails = {
  ...bloomburrowRow,
  sections: [
    draftCards,
    {
      name: 'Borderless Cards',
      completion: completion({ owned: 1, size: 2 }, { owned: 1, size: 2 }, { owned: 0, size: 2 }),
      card_printings: [
        printing('282', 'Season of the Burrow', { any: 0, nonfoil: 0, foil: 0 }),
        printing('287', 'Beza, the Bounding Spring', { any: 3, nonfoil: 3, foil: 0 }),
      ],
    },
  ],
  other: noOther,
};

function topScreen() {
  return within(tabStackTopScreen());
}

async function chooseFinishView(name: string) {
  await fireEvent.press(topScreen().getByRole('radio', { name }));
}

function setRowLabels() {
  return topScreen()
    .getAllByRole('button')
    .map((row) => row.props.accessibilityLabel);
}

function tileLabels() {
  return topScreen()
    .queryAllByRole('image')
    .map((tile) => tile.props.accessibilityLabel);
}

function tile(name: string) {
  return topScreen().getByRole('image', { name });
}

async function openSets() {
  await renderApp();
  await pressTab('Collection');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'Sets' }));
}

async function openBloomburrow() {
  await fireEvent.press(topScreen().getByRole('button', { name: /^Bloomburrow/ }));
}

async function openAlphaInFoil() {
  await openSets();
  await fireEvent.press(topScreen().getByRole('button', { name: /^Limited Edition Alpha/ }));
  await chooseFinishView('Foil');
  return topScreen().getByRole('header', { name: /^Limited Edition Alpha/ });
}

beforeEach(() => {
  startSignedIn();
  ownCollectionCopies([curator]);
  offerSets([bloomburrowRow, alphaRow]);
  offerSetPage(bloomburrow);
});

describe('the finish view control', () => {
  test('Sets shows Any finish, Nonfoil, and Foil under the search bar, with Any finish chosen', async () => {
    await openSets();

    expect(topScreen().getByRole('radio', { name: 'Any finish', checked: true })).toBeOnTheScreen();
    expect(topScreen().getByRole('radio', { name: 'Nonfoil', checked: false })).toBeOnTheScreen();
    expect(topScreen().getByRole('radio', { name: 'Foil', checked: false })).toBeOnTheScreen();
    expect(appearsBefore(topScreen().getByRole('radio', { name: 'Foil' }), topScreen().getByRole('button', { name: /^Bloomburrow/ }))).toBe(true);
  });

  test('the set page shows the same control under its header', async () => {
    await openSets();
    await openBloomburrow();

    const header = topScreen().getByRole('header', { name: /^Bloomburrow/ });
    const anyFinish = topScreen().getByRole('radio', { name: 'Any finish', checked: true });
    expect(topScreen().getAllByRole('radio').map((segment) => within(segment).getByText(/./).props.children)).toEqual([
      'Any finish',
      'Nonfoil',
      'Foil',
    ]);
    expect(appearsBefore(header, anyFinish)).toBe(true);
    expect(appearsBefore(anyFinish, tile('Banishing Light, number 1, owned'))).toBe(true);
  });
});

describe('Sets in a finish view', () => {
  test('choosing a finish view reads Sets again from the first page, and the rows show set completion in that view', async () => {
    await openSets();

    await chooseFinishView('Nonfoil');

    expect(setRowLabels()).toEqual(['Bloomburrow, 1 of 3, 33 percent', 'Limited Edition Alpha, 1 of 5, 20 percent']);
    expect(topScreen().getByText('1 of 3')).toBeOnTheScreen();
    expect(requestsSent('list_sets')).toEqual([
      { finish_view: 'any', cursor: null },
      { finish_view: 'nonfoil', cursor: null },
    ]);
  });

  test('a set whose main set is empty in Foil, such as Alpha, is hidden in Foil', async () => {
    await openSets();
    expect(setRowLabels()).toEqual(['Bloomburrow, 2 of 3, 66 percent', 'Limited Edition Alpha, 1 of 5, 20 percent']);

    await chooseFinishView('Foil');

    expect(setRowLabels()).toEqual(['Bloomburrow, 1 of 3, 33 percent']);
  });

  test('the set art banners on Sets and the set page color the set completion in the chosen finish view', async () => {
    await openSets();
    expect(setArtLook(topScreen().getByRole('button', { name: /^Bloomburrow/ })).coloredShare).toBeCloseTo(0.6667, 4);

    await chooseFinishView('Nonfoil');

    expect(setArtLook(topScreen().getByRole('button', { name: /^Bloomburrow/ })).coloredShare).toBeCloseTo(0.3333, 4);
    await openBloomburrow();
    expect(setArtLook(topScreen().getByRole('header', { name: 'Bloomburrow, 1 of 3, 33 percent' })).coloredShare).toBeCloseTo(0.3333, 4);
  });
});

describe('one finish view for Sets and the set page', () => {
  test('switching the finish view on Sets shows it on the set page', async () => {
    await openSets();
    await chooseFinishView('Foil');

    await openBloomburrow();

    expect(topScreen().getByRole('radio', { name: 'Foil', checked: true })).toBeOnTheScreen();
    expect(topScreen().getByRole('header', { name: 'Bloomburrow, 1 of 3, 33 percent' })).toBeOnTheScreen();
  });

  test('switching the finish view on the set page shows it on Sets', async () => {
    await openSets();
    await openBloomburrow();

    await chooseFinishView('Nonfoil');
    await swipeBackInTheTab();

    expect(topScreen().getByRole('radio', { name: 'Nonfoil', checked: true })).toBeOnTheScreen();
    expect(setRowLabels()).toEqual(['Bloomburrow, 1 of 3, 33 percent', 'Limited Edition Alpha, 1 of 5, 20 percent']);
  });

  test('the phone keeps the finish view after the app starts again', async () => {
    await openSets();
    await chooseFinishView('Foil');

    await restartTheApp();
    await pressTab('Collection');
    await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'Sets' }));

    expect(topScreen().getByRole('radio', { name: 'Foil', checked: true })).toBeOnTheScreen();
    expect(setRowLabels()).toEqual(['Bloomburrow, 1 of 3, 33 percent']);
  });
});

describe('the set page in a finish view', () => {
  test('the header, each set section header, the lit and dimmed tiles, and the quantity badges follow the finish view, without reading the set again', async () => {
    await openSets();
    await openBloomburrow();

    await chooseFinishView('Nonfoil');

    expect(topScreen().getByRole('header', { name: 'Bloomburrow, 1 of 3, 33 percent' })).toBeOnTheScreen();
    expect(topScreen().getByRole('header', { name: 'Draft Cards, 1 of 3, 33 percent' })).toBeOnTheScreen();
    expect(topScreen().getByRole('header', { name: 'Borderless Cards, 1 of 2, 50 percent' })).toBeOnTheScreen();
    expect(tileLabels()).toEqual([
      'Banishing Light, number 1, owned',
      'Beza, the Bounding Spring, number 2, not owned',
      'Dewdrop Cure, number 10, not owned',
      'Season of the Burrow, number 282, not owned',
      'Beza, the Bounding Spring, number 287, owned, 3 copies',
    ]);
    expect(cardImageLook(tile('Beza, the Bounding Spring, number 2, not owned'))).toEqual({ opacity: expect.closeTo(0.38), grayscale: true });

    await chooseFinishView('Foil');

    const borderless = topScreen().getByRole('header', { name: 'Borderless Cards, 0 of 2, 0 percent' });
    expect(within(borderless).getByRole('progressbar')).toHaveProp('accessibilityValue', { min: 0, max: 2, now: 0 });
    const beza = tile('Beza, the Bounding Spring, number 2, owned, 2 copies');
    expect(cardImageLook(beza)).toEqual({ opacity: 1, grayscale: false });
    expect(within(beza).getByText('2')).toBeOnTheScreen();
    expect(within(tile('Beza, the Bounding Spring, number 287, not owned')).queryByText('3')).toBeNull();
    expect(requestsSent('get_set')).toEqual([{ code: 'blb' }]);
  });

  test('a card printing that the finish view leaves out is not shown', async () => {
    offerSetPage({
      ...bloomburrow,
      sections: [
        { ...draftCards, card_printings: [...draftCards.card_printings, printing('15', 'Starfall Invocation', { any: 1, nonfoil: 1, foil: null })] },
        bloomburrow.sections[1]!,
      ],
    });
    await openSets();
    await openBloomburrow();
    expect(tileLabels()).toContain('Starfall Invocation, number 15, owned');

    await chooseFinishView('Foil');

    expect(tileLabels()).toEqual([
      'Banishing Light, number 1, not owned',
      'Beza, the Bounding Spring, number 2, owned, 2 copies',
      'Dewdrop Cure, number 10, not owned',
      'Season of the Burrow, number 282, not owned',
      'Beza, the Bounding Spring, number 287, not owned',
    ]);
  });

  test('a set section with no card printings left in the finish view is hidden, and so is an empty Other cards', async () => {
    offerSetPage({
      ...bloomburrow,
      sections: [
        ...bloomburrow.sections,
        {
          name: 'Retro Frame Cards',
          completion: completion({ owned: 1, size: 1 }, { owned: 1, size: 1 }, noSet),
          card_printings: [printing('400', 'Starfall Invocation', { any: 1, nonfoil: 1, foil: null })],
        },
      ],
      other: {
        completion: completion({ owned: 0, size: 1 }, { owned: 0, size: 1 }, noSet),
        card_printings: [printing('300', 'Fabled Passage', { any: 0, nonfoil: 0, foil: null })],
      },
    });
    await openSets();
    await openBloomburrow();
    expect(topScreen().getByRole('header', { name: 'Retro Frame Cards, 1 of 1, 100 percent, complete' })).toBeOnTheScreen();
    expect(topScreen().getByRole('header', { name: 'Other cards, 0 of 1, 0 percent' })).toBeOnTheScreen();

    await chooseFinishView('Foil');

    expect(topScreen().queryByText('Retro Frame Cards')).toBeNull();
    expect(topScreen().queryByText('Other cards')).toBeNull();
    expect(tileLabels()).not.toContain('Starfall Invocation, number 400, owned');
    expect(tileLabels()).not.toContain('Fabled Passage, number 300, not owned');
  });

  test('a set page whose main set is empty in the finish view, such as Alpha in Foil, shows "0 of 0" and is not complete', async () => {
    offerSetPage(alpha);

    const header = await openAlphaInFoil();

    expect(header).toHaveProp('accessibilityLabel', 'Limited Edition Alpha, 0 of 0');
    expect(within(header).getByText('0 of 0')).toBeOnTheScreen();
    expect(within(header).queryByText('✓')).toBeNull();
    expect(within(header).queryByText(/%/)).toBeNull();
    expect(header).toHaveStyle({ borderColor: '#00000000' });
    expect(setSymbolFillShare(header)).toBe(0);
  });

  test('a set page banner whose main set is empty in the finish view has no colored share and is not complete', async () => {
    offerSetPage({ ...alpha, set_art_uri: 'https://cards.scryfall.io/art_crop/front/lea.jpg' });

    const header = await openAlphaInFoil();

    expect(header).toHaveProp('accessibilityLabel', 'Limited Edition Alpha, 0 of 0');
    expect(within(header).queryByText('✓')).toBeNull();
    expect(within(header).queryByText(/%/)).toBeNull();
    expect(header).toHaveStyle({ borderColor: '#00000000' });
    expect(setArtLook(header)).toMatchObject({ coloredShare: 0, edgeLine: false });
  });

  test('a lit tile in the Foil view carries the foil sheen, and other tiles do not', async () => {
    await openSets();
    await openBloomburrow();
    expect(cardSheen(tile('Beza, the Bounding Spring, number 2, owned, 2 copies'))).toBeNull();

    await chooseFinishView('Foil');

    const sheen = cardSheen(tile('Beza, the Bounding Spring, number 2, owned, 2 copies'))!;
    expect(String(sheen.experimental_backgroundImage).startsWith('linear-gradient(115deg, transparent 22%, rgba(255, 80, 170, 0.55) 34%')).toBe(true);
    expect(cardSheen(tile('Banishing Light, number 1, not owned'))).toBeNull();
  });
});
