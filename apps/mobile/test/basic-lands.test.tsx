import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { fireEvent, within } from 'expo-router/testing-library';

import { deckCardOf, openDeckNamed } from './copies';
import {
  addPreviewQueriesSent,
  answerCollectionSearches,
  basicLandOracleId,
  basicLandsOf,
  deckWritesSent,
  failDeckWrites,
  ownAddPreviewEffects,
  ownCollectionCopies,
  ownCollectionTotal,
  ownDecks,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  buttonMenuActions,
  cardImageUri,
  contextMenu,
  isDrawerPresented,
  menuButton,
  menuButtonNames,
  pressAlertButton,
  pressButtonMenuAction,
  pressButtonMenuItem,
  presentedAlert,
  presentedDrawerContent,
  pressTab,
  pushedScreen,
  scrollToEnd,
  selectedTab,
  typeInSearchBar,
} from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

const basicLandNames = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
  'Snow-Covered Wastes',
];

const basicLandTileName = /, basic land, unlimited$/;

function copyRows(name: string, count: number): CollectionCopyRow[] {
  return Array.from({ length: count }, (_, index) => ({
    copy_id: `copy-${name}-${index + 1}`,
    printing_id: `printing-${name}`,
    name,
    set: 'isd',
    collector_number: String(index + 1),
    rarity: 'common',
    image_uris: [`https://cards.scryfall.io/normal/front/${name}.jpg`],
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    protected: false,
    price: null,
    deck: null,
    held_for: null,
  }));
}

async function openCollection() {
  await renderApp();
  await pressTab('Collection');
  return within(selectedTab());
}

type Queries = Awaited<ReturnType<typeof openCollection>>;

function basicLandTileNames(collection: Queries) {
  return collection.queryAllByRole('button', { name: basicLandTileName }).map((tile) => tile.props.accessibilityLabel.split(',')[0]);
}

function basicLandWrites() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'change_basic_land' ? [request] : []));
}

async function openAddToDeck(collection: Queries, name: string) {
  await fireEvent.press(collection.getByRole('button', { name: `${name}, basic land, unlimited` }));
  const drawer = within(presentedDrawerContent());
  await drawer.findByRole('header', { name: 'Add to deck' });
  return drawer;
}

describe('basic lands in the collection', () => {
  test('the plain binder ends with the twelve basic land cards, each with its image and an ∞ badge and no price', async () => {
    ownCollectionCopies(copyRows('Ponder', 2));

    const collection = await openCollection();

    expect(await collection.findByRole('button', { name: 'Plains, basic land, unlimited' })).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual(basicLandNames);
    const island = collection.getByRole('button', { name: 'Island, basic land, unlimited' });
    expect(cardImageUri(island)).toBe(`https://cards.scryfall.io/normal/front/${basicLandOracleId('Island')}.jpg`);
    expect(within(island).getByText('∞')).toBeOnTheScreen();
    expect(within(island).queryByText('—')).not.toBeOnTheScreen();
    const [lastCopy] = collection.getAllByRole('button', { name: /^Ponder/ }).slice(-1);
    expect(appearsBefore(lastCopy!, collection.getByRole('button', { name: 'Plains, basic land, unlimited' }))).toBe(true);
  });

  test('the basic land cards show only once the last page of copies has loaded', async () => {
    ownCollectionCopies(Array.from({ length: 70 }, (_, index) => copyRows(`Card ${index + 1}`, 1)).flat());
    const collection = await openCollection();
    await collection.findByRole('button', { name: /^Card 1,/ });
    expect(basicLandTileNames(collection)).toEqual([]);

    await scrollToEnd(selectedTab());

    expect(await collection.findByRole('button', { name: 'Plains, basic land, unlimited' })).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toHaveLength(12);
  });

  test('an empty collection shows its empty state with no basic land cards', async () => {
    const collection = await openCollection();

    expect(collection.getByLabelText('Your collection is empty, Scan cards to add them to your collection.')).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual([]);
  });

  test('a search shows the basic land cards whose names match last, after the matching copies, and the count line counts only copies', async () => {
    ownCollectionCopies(copyRows('Ponder', 3));
    ownCollectionTotal({ total: '3.00', currency: 'USD', priced_copies: 3, copies: 3, stale: false, prices_observed_at: null });
    const islandSanctuary = copyRows('Island Sanctuary', 1);
    answerCollectionSearches((query) => (query.text === 'island' ? islandSanctuary : copyRows('Ponder', 3)));
    const collection = await openCollection();

    await typeInSearchBar('island');

    expect(await collection.findByRole('button', { name: 'Island, basic land, unlimited' })).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual(['Island', 'Snow-Covered Island']);
    expect(
      appearsBefore(
        collection.getByRole('button', { name: /^Island Sanctuary/ }),
        collection.getByRole('button', { name: 'Island, basic land, unlimited' }),
      ),
    ).toBe(true);
    expect(collection.getByText('1 of 3 copies')).toBeOnTheScreen();
  });

  test('with no matching copies, the matching basic land cards are the only results', async () => {
    ownCollectionCopies(copyRows('Ponder', 1));
    answerCollectionSearches((query) => (query.text ? [] : copyRows('Ponder', 1)));
    const collection = await openCollection();

    await typeInSearchBar('snow forest');

    expect(await collection.findByRole('button', { name: 'Snow-Covered Forest, basic land, unlimited' })).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual(['Snow-Covered Forest']);
    expect(collection.queryByText('No cards found')).not.toBeOnTheScreen();
  });

  test('a name chip matches basic land cards, and any other chip hides every basic land card', async () => {
    ownCollectionCopies(copyRows('Ponder', 1));
    answerCollectionSearches(() => []);
    const collection = await openCollection();

    await typeInSearchBar('name:mountain ');
    expect(await collection.findByRole('button', { name: 'Mountain, basic land, unlimited' })).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual(['Mountain', 'Snow-Covered Mountain']);

    await typeInSearchBar('set:m10 ');
    expect(await collection.findByText('No cards found')).toBeOnTheScreen();
    expect(basicLandTileNames(collection)).toEqual([]);
  });
});

describe('adding basic lands to a deck', () => {
  beforeEach(() => {
    ownCollectionCopies(copyRows('Ponder', 1));
    ownDecks([
      { name: 'Atraxa', priority: 'medium', card_count: 0 },
      { name: 'Kinnan', priority: 'high', card_count: 99, basic_lands: basicLandsOf({ Island: 99 }) },
    ]);
  });

  test('tapping a basic land card opens Add to deck with a stepper from 1 to 99 above the deck rows', async () => {
    const drawer = await openAddToDeck(await openCollection(), 'Island');

    expect(drawer.getByLabelText('Island, 1')).toHaveTextContent('1');
    expect(drawer.getByRole('button', { name: 'Remove one Island' })).toBeDisabled();
    expect(drawer.getByRole('button', { name: 'Add one Island' })).toBeEnabled();
    expect(appearsBefore(drawer.getByLabelText('Island, 1'), drawer.getByRole('button', { name: /^Atraxa,/ }))).toBe(true);
    expect(drawer.getByRole('button', { name: /^Kinnan,/ })).toBeOnTheScreen();
    expect(addPreviewQueriesSent().at(-1)).toEqual({ basic_land_oracle_id: basicLandOracleId('Island'), count: 1 });
  });

  test('each deck row shows the effect of adding that many of the basic land card', async () => {
    ownAddPreviewEffects({ 'deck-1': { kind: 'adds_violation', rules: [{ rule: 'color_identity', colors: ['U'] }] } });
    const drawer = await openAddToDeck(await openCollection(), 'Island');

    await fireEvent.press(drawer.getByRole('button', { name: 'Add one Island' }));
    await fireEvent.press(drawer.getByRole('button', { name: 'Add one Island' }));

    expect(drawer.getByLabelText('Island, 3')).toHaveTextContent('3');
    expect(addPreviewQueriesSent().at(-1)).toEqual({ basic_land_oracle_id: basicLandOracleId('Island'), count: 3 });
    expect(within(drawer.getByRole('button', { name: /^Atraxa,/ })).getByText('Adds a violation')).toBeOnTheScreen();
  });

  test('a tap on a deck adds that many in one write and closes the drawer', async () => {
    const drawer = await openAddToDeck(await openCollection(), 'Island');
    await fireEvent.press(drawer.getByRole('button', { name: 'Add one Island' }));

    await fireEvent.press(drawer.getByRole('button', { name: /^Atraxa,/ }));

    expect(basicLandWrites()).toEqual([{ deck_id: 'deck-1', oracle_id: basicLandOracleId('Island'), by: 2 }]);
    expect(isDrawerPresented()).toBe(false);
    expect(presentedAlert()).toBeNull();
  });

  test('an add that takes a deck over 99 of the basic land card says so and keeps the drawer', async () => {
    const drawer = await openAddToDeck(await openCollection(), 'Island');

    await fireEvent.press(drawer.getByRole('button', { name: /^Kinnan,/ }));

    expect(presentedAlert()).toEqual({
      title: 'Could not add these basic lands',
      message: 'A deck has up to 99 of each basic land.',
      buttons: ['OK'],
    });
    await pressAlertButton('OK');
    expect(isDrawerPresented()).toBe(true);
  });

  test('an add that fails says to check the connection and keeps the drawer', async () => {
    const drawer = await openAddToDeck(await openCollection(), 'Island');
    failDeckWrites(1);

    await fireEvent.press(drawer.getByRole('button', { name: /^Atraxa,/ }));

    expect(presentedAlert()).toEqual({ title: 'Could not add these basic lands', message: 'Check your connection.', buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(isDrawerPresented()).toBe(true);
  });
});

describe('basic lands on the Cards tab', () => {
  async function openDeck(counts: Record<string, number>, cards = [deckCardOf('tower', 'Command Tower', 'Land', { mana_value: 0 })]) {
    const basicLandCount = Object.values(counts).reduce((total, count) => total + count, 0);
    ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: cards.length + basicLandCount, cards, basic_lands: basicLandsOf(counts) }]);
    await renderApp();
    await pressTab('Decks');
    return openDeckNamed('Atraxa');
  }

  type Deck = Awaited<ReturnType<typeof openDeck>>;

  function headers(deck: Deck) {
    return deck.getAllByRole('header').map((header) => header.props.accessibilityLabel ?? header.props.children);
  }

  function landTileNames(deck: Deck) {
    const tiles = [
      ...deck.queryAllByRole('button', { name: /^Command Tower/ }),
      ...deck.queryAllByRole('image', { name: /^(Island|Snow-Covered Forest)$/ }),
    ];
    return tiles
      .sort((a, b) => (appearsBefore(a, b) ? -1 : 1))
      .map((tile) => tile.props.accessibilityLabel.split(',')[0]);
  }

  test('each basic land shows as its own tile in the Lands group, sorted with the other lands, and the Basic lands group is gone', async () => {
    const deck = await openDeck({ Island: 3, 'Snow-Covered Forest': 1 });

    expect(headers(deck)).toEqual(['Atraxa', 'Commander', 'Lands, 5']);
    expect(landTileNames(deck)).toEqual(['Command Tower', 'Island', 'Island', 'Island', 'Snow-Covered Forest']);
    const islands = deck.getAllByRole('image', { name: 'Island' });
    expect(cardImageUri(islands[0]!)).toBe(`https://cards.scryfall.io/normal/front/${basicLandOracleId('Island')}.jpg`);
    expect(deck.queryByRole('button', { name: 'Edit' })).not.toBeOnTheScreen();
    expect(within(islands[0]!).queryByText(/^×/)).not.toBeOnTheScreen();
  });

  test('basic lands are Colorless by color, Common by rarity, and last under Recently added', async () => {
    const tower = deckCardOf('tower', 'Command Tower', 'Land', { mana_value: 0, rarity: 'common', added_at: '2026-10-15T09:00:00.000Z' });
    const deck = await openDeck({ Island: 1 }, [tower]);

    await pressButtonMenuItem(menuButton(pushedScreen(), 'Group, Type'), 'Color');
    expect(headers(deck)).toEqual(['Atraxa', 'Commander', 'Colorless, 2']);

    await pressButtonMenuItem(menuButton(pushedScreen(), 'Group, Color'), 'Rarity');
    expect(headers(deck)).toEqual(['Atraxa', 'Commander', 'Common, 2']);

    await pressButtonMenuItem(menuButton(pushedScreen(), 'Sort, Name, A to Z'), 'Recently added');
    expect(landTileNames(deck)).toEqual(['Command Tower', 'Island']);
    const sortName = menuButtonNames(pushedScreen()).find((name) => name?.startsWith('Sort,'))!;
    await pressButtonMenuItem(menuButton(pushedScreen(), sortName), 'Recently added');
    expect(menuButtonNames(pushedScreen())).not.toContain(sortName);
    expect(landTileNames(deck)).toEqual(['Command Tower', 'Island']);
  });

  test('a long press on a basic land tile offers only Remove from deck in red, and a tap does nothing', async () => {
    const deck = await openDeck({ Island: 2 });

    const [island] = deck.getAllByRole('image', { name: 'Island' });

    expect(deck.queryByRole('button', { name: /^Island/ })).not.toBeOnTheScreen();
    expect(buttonMenuActions(contextMenu(island!))).toEqual([{ title: 'Remove from deck', destructive: true }]);
  });

  test('Remove from deck takes one of that basic land out of the deck', async () => {
    const deck = await openDeck({ Island: 2 });

    await pressButtonMenuAction(contextMenu(deck.getAllByRole('image', { name: 'Island' })[0]!), 'Remove from deck');

    expect(basicLandWrites()).toEqual([{ deck_id: 'deck-1', oracle_id: basicLandOracleId('Island'), by: -1 }]);
    expect(await deck.findByRole('header', { name: 'Lands, 2' })).toBeOnTheScreen();
    expect(deck.getAllByRole('image', { name: 'Island' })).toHaveLength(1);
  });

  test('a remove that fails says so and keeps the basic land', async () => {
    const deck = await openDeck({ Island: 2 });
    failDeckWrites(1);

    await pressButtonMenuAction(contextMenu(deck.getAllByRole('image', { name: 'Island' })[0]!), 'Remove from deck');

    expect(presentedAlert()).toEqual({ title: 'Could not remove this card', message: 'Check your connection.', buttons: ['OK'] });
    expect(deck.getAllByRole('image', { name: 'Island' })).toHaveLength(2);
  });
});
