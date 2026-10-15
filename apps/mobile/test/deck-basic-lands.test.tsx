import { fireEvent, within } from 'expo-router/testing-library';

import {
  cardImageUri,
  imageSources,
  isDrawerPresented,
  menuButtonNames,
  pressAlertButton,
  presentedAlert,
  presentedDrawer,
  presentedDrawerContent,
  pressTab,
  pushedScreen,
  selectedTab,
  swipeDownDrawer,
} from './native-ui';
import { basicLandOracleId, basicLandsOf, deckWritesSent, failDeckWrites, ownDecks, startSignedIn } from './fake-supabase';
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

async function openDeck(counts: Record<string, number>, cardCount = Object.values(counts).reduce((total, count) => total + count, 0)) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: cardCount, basic_lands: basicLandsOf(counts) }]);
  await renderApp();
  await pressTab('Decks');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: /^Atraxa,/ }));
  const deck = within(pushedScreen());
  await deck.findByRole('header', { name: 'Atraxa' });
  return deck;
}

type Screen = Awaited<ReturnType<typeof openDeck>>;

async function openBasicLandsDrawer(deck: Screen) {
  await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
  const drawer = within(presentedDrawerContent());
  await drawer.findByRole('header', { name: 'Basic lands' });
  return drawer;
}

function basicLandsSent() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'set_basic_lands' ? [request] : []));
}

async function step(drawer: Screen, label: string, times = 1) {
  for (let press = 0; press < times; press += 1) {
    await fireEvent.press(drawer.getByRole('button', { name: label }));
  }
}

function headers(deck: Screen) {
  return deck.getAllByRole('header').map((header) => header.props.accessibilityLabel ?? header.props.children);
}

describe('basic lands on the Cards tab', () => {
  test('the Basic lands group comes last and shows the basic land cards above zero, each with a count badge', async () => {
    const deck = await openDeck({ Island: 8, 'Snow-Covered Forest': 2 });

    expect(headers(deck).at(-1)).toBe('Basic lands, 10');
    const tiles = deck.getAllByRole('image', { name: /^(Island|Snow-Covered Forest|Plains)/ });
    expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual(['Island, 8', 'Snow-Covered Forest, 2']);
    expect(within(tiles[0]!).getByText('×8')).toBeOnTheScreen();
    expect(cardImageUri(tiles[0]!)).toBe(`https://cards.scryfall.io/normal/front/${basicLandOracleId('Island')}.jpg`);
    expect(within(tiles[1]!).getByText('×2')).toBeOnTheScreen();
  });

  test('a basic land tile is not a button, so it has no long-press menu', async () => {
    const deck = await openDeck({ Island: 8 });

    expect(deck.queryByRole('button', { name: /Island/ })).not.toBeOnTheScreen();
  });

  test('an empty deck shows the Basic lands group with Edit after the empty state', async () => {
    const deck = await openDeck({});

    expect(deck.getByText('No cards yet')).toBeOnTheScreen();
    expect(headers(deck).at(-1)).toBe('Basic lands');
    expect(deck.getByRole('button', { name: 'Edit' })).toBeOnTheScreen();
  });
});

describe('the basic lands drawer', () => {
  test('Edit opens a half-height drawer titled Basic lands with one row per basic land card, each with its image, name, and a stepper', async () => {
    const deck = await openDeck({ Island: 8 });

    const drawer = await openBasicLandsDrawer(deck);

    expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
    expect(basicLandNames.map((name) => drawer.getByText(name))).toHaveLength(12);
    expect(imageSources(presentedDrawerContent())).toEqual(
      basicLandNames.map((name) => `https://cards.scryfall.io/normal/front/${basicLandOracleId(name)}.jpg`),
    );
    expect(drawer.getAllByRole('button', { name: /^Add one / }).map((button) => button.props.accessibilityLabel)).toEqual(
      basicLandNames.map((name) => `Add one ${name}`),
    );
    expect(drawer.getAllByRole('button', { name: /^Remove one / })).toHaveLength(12);
    expect(drawer.getByLabelText('Island, 8')).toHaveTextContent('8');
    expect(drawer.getByLabelText('Plains, 0')).toHaveTextContent('0');
    expect(drawer.getByRole('button', { name: 'Remove one Plains' })).toBeDisabled();
    expect(drawer.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(drawer.getByRole('button', { name: 'Save 0 changes' })).toBeDisabled();
  });

  test('the deck screen keeps its count badges, Edit, and the group and sort buttons, and shows no steppers', async () => {
    const deck = await openDeck({ Island: 8 });

    await openBasicLandsDrawer(deck);

    const behindTheDrawer = { includeHiddenElements: true };
    expect(deck.getByRole('image', { name: 'Island, 8', ...behindTheDrawer })).toBeOnTheScreen();
    expect(deck.getByRole('button', { name: 'Edit', ...behindTheDrawer })).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Add one /, ...behindTheDrawer })).not.toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Save/, ...behindTheDrawer })).not.toBeOnTheScreen();
    expect(menuButtonNames(pushedScreen())).toEqual(['Group, Type', 'Sort, Name, A to Z']);
  });

  test('Save counts the basic land cards whose count changed', async () => {
    const drawer = await openBasicLandsDrawer(await openDeck({ Island: 8 }));

    await step(drawer, 'Add one Plains', 2);
    expect(drawer.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();

    await step(drawer, 'Remove one Island');
    expect(drawer.getByRole('button', { name: 'Save 2 changes' })).toBeEnabled();

    await step(drawer, 'Add one Island');
    expect(drawer.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
  });

  test('a stepper stops at 99', async () => {
    const drawer = await openBasicLandsDrawer(await openDeck({ Island: 99 }));

    expect(drawer.getByRole('button', { name: 'Add one Island' })).toBeDisabled();
    expect(drawer.getByRole('button', { name: 'Remove one Island' })).toBeEnabled();
  });

  test('Save sends one write with every changed count, closes the drawer, and the deck shows the new counts', async () => {
    const deck = await openDeck({ Island: 8 });
    const drawer = await openBasicLandsDrawer(deck);
    await step(drawer, 'Add one Plains', 2);
    await step(drawer, 'Remove one Island');

    await fireEvent.press(drawer.getByRole('button', { name: 'Save 2 changes' }));

    expect(basicLandsSent()).toEqual([
      {
        deck_id: 'deck-1',
        counts: [
          { oracle_id: basicLandOracleId('Plains'), count: 2 },
          { oracle_id: basicLandOracleId('Island'), count: 7 },
        ],
      },
    ]);
    expect(isDrawerPresented()).toBe(false);
    expect(await deck.findByRole('image', { name: 'Plains, 2' })).toBeOnTheScreen();
    expect(deck.getByRole('image', { name: 'Island, 7' })).toBeOnTheScreen();
    expect(headers(deck).at(-1)).toBe('Basic lands, 9');
  });

  test('Cancel closes the drawer and changes nothing', async () => {
    const deck = await openDeck({ Island: 8 });
    const drawer = await openBasicLandsDrawer(deck);
    await step(drawer, 'Add one Plains');
    await step(drawer, 'Remove one Island', 3);

    await fireEvent.press(drawer.getByRole('button', { name: 'Cancel' }));

    expect(isDrawerPresented()).toBe(false);
    expect(basicLandsSent()).toEqual([]);
    expect(deck.getByRole('image', { name: 'Island, 8' })).toBeOnTheScreen();
    expect(deck.queryByRole('image', { name: /^Plains/ })).not.toBeOnTheScreen();

    const reopened = await openBasicLandsDrawer(deck);
    expect(reopened.getByLabelText('Island, 8')).toHaveTextContent('8');
    expect(reopened.getByLabelText('Plains, 0')).toHaveTextContent('0');
  });

  test('a swipe down closes the drawer and changes nothing', async () => {
    const deck = await openDeck({ Island: 8 });
    const drawer = await openBasicLandsDrawer(deck);
    await step(drawer, 'Add one Plains');

    await swipeDownDrawer();

    expect(isDrawerPresented()).toBe(false);
    expect(basicLandsSent()).toEqual([]);
    expect(deck.queryByRole('image', { name: /^Plains/ })).not.toBeOnTheScreen();

    const reopened = await openBasicLandsDrawer(deck);
    expect(reopened.getByLabelText('Plains, 0')).toHaveTextContent('0');
  });

  test('a save that fails says so and keeps the drawer open with the changes', async () => {
    const drawer = await openBasicLandsDrawer(await openDeck({ Island: 8 }));
    await step(drawer, 'Add one Plains');
    failDeckWrites(1);

    await fireEvent.press(drawer.getByRole('button', { name: 'Save 1 change' }));

    expect(presentedAlert()).toEqual({ title: 'Could not save the basic lands', message: 'Check your connection.', buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(isDrawerPresented()).toBe(true);
    expect(drawer.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
    expect(drawer.getByLabelText('Plains, 1')).toHaveTextContent('1');
  });
});
