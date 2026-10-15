import { fireEvent, within } from 'expo-router/testing-library';

import { pressAlertButton, presentedAlert, pressTab, pushedScreen, selectedTab, cardImageUri } from './native-ui';
import { basicLandOracleId, basicLandsOf, deckWritesSent, failDeckWrites, ownDecks, startSignedIn } from './fake-supabase';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

async function openDeck(counts: Record<string, number>, cardCount = Object.values(counts).reduce((total, count) => total + count, 0)) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: cardCount, basic_lands: basicLandsOf(counts) }]);
  await renderApp();
  await pressTab('Decks');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: /^Atraxa,/ }));
  const deck = within(pushedScreen());
  await deck.findByRole('header', { name: 'Atraxa' });
  return deck;
}

type Deck = Awaited<ReturnType<typeof openDeck>>;

function basicLandsSent() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'set_basic_lands' ? [request] : []));
}

async function step(deck: Deck, label: string, times = 1) {
  for (let press = 0; press < times; press += 1) {
    await fireEvent.press(deck.getByRole('button', { name: label }));
  }
}

function headers(deck: Deck) {
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

  test('Edit shows all twelve basic land cards with a stepper under each, and a Save bar with Cancel and Save 0 changes', async () => {
    const deck = await openDeck({ Island: 8 });

    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));

    expect(deck.queryByRole('button', { name: 'Edit' })).not.toBeOnTheScreen();
    expect(deck.getAllByRole('button', { name: /^Add one / }).map((button) => button.props.accessibilityLabel)).toEqual([
      'Add one Plains',
      'Add one Island',
      'Add one Swamp',
      'Add one Mountain',
      'Add one Forest',
      'Add one Wastes',
      'Add one Snow-Covered Plains',
      'Add one Snow-Covered Island',
      'Add one Snow-Covered Swamp',
      'Add one Snow-Covered Mountain',
      'Add one Snow-Covered Forest',
      'Add one Snow-Covered Wastes',
    ]);
    expect(deck.getAllByRole('button', { name: /^Remove one / })).toHaveLength(12);
    expect(deck.getByLabelText('Island, 8')).toHaveTextContent('8');
    expect(deck.getByLabelText('Plains, 0')).toHaveTextContent('0');
    expect(deck.getByRole('button', { name: 'Remove one Plains' })).toBeDisabled();
    expect(deck.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(deck.getByRole('button', { name: 'Save 0 changes' })).toBeDisabled();
  });

  test('the Save bar counts the basic land cards whose count changed', async () => {
    const deck = await openDeck({ Island: 8 });
    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));

    await step(deck, 'Add one Plains', 2);
    expect(deck.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();

    await step(deck, 'Remove one Island');
    expect(deck.getByRole('button', { name: 'Save 2 changes' })).toBeEnabled();

    await step(deck, 'Add one Island');
    expect(deck.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
  });

  test('a stepper stops at 99', async () => {
    const deck = await openDeck({ Island: 99 });

    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));

    expect(deck.getByRole('button', { name: 'Add one Island' })).toBeDisabled();
    expect(deck.getByRole('button', { name: 'Remove one Island' })).toBeEnabled();
  });

  test('Save sends one write with the changed basic land cards, then shows the new counts', async () => {
    const deck = await openDeck({ Island: 8 });
    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    await step(deck, 'Add one Plains', 2);
    await step(deck, 'Remove one Island');

    await fireEvent.press(deck.getByRole('button', { name: 'Save 2 changes' }));

    expect(basicLandsSent()).toEqual([
      {
        deck_id: 'deck-1',
        counts: [
          { oracle_id: basicLandOracleId('Plains'), count: 2 },
          { oracle_id: basicLandOracleId('Island'), count: 7 },
        ],
      },
    ]);
    expect(await deck.findByRole('image', { name: 'Plains, 2' })).toBeOnTheScreen();
    expect(deck.getByRole('image', { name: 'Island, 7' })).toBeOnTheScreen();
    expect(headers(deck).at(-1)).toBe('Basic lands, 9');
    expect(deck.queryByRole('button', { name: /^Save/ })).not.toBeOnTheScreen();
    expect(deck.getByRole('button', { name: 'Edit' })).toBeOnTheScreen();
  });

  test('Cancel restores the counts and sends nothing', async () => {
    const deck = await openDeck({ Island: 8 });
    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    await step(deck, 'Add one Plains');
    await step(deck, 'Remove one Island', 3);

    await fireEvent.press(deck.getByRole('button', { name: 'Cancel' }));

    expect(basicLandsSent()).toEqual([]);
    expect(deck.getByRole('image', { name: 'Island, 8' })).toBeOnTheScreen();
    expect(deck.queryByRole('image', { name: /^Plains/ })).not.toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: 'Cancel' })).not.toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    expect(deck.getByLabelText('Island, 8')).toHaveTextContent('8');
    expect(deck.getByLabelText('Plains, 0')).toHaveTextContent('0');
  });

  test('the Save bar shows only on Cards, and the changes stay while History shows', async () => {
    const deck = await openDeck({ Island: 8 });
    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    await step(deck, 'Add one Plains');

    await fireEvent.press(deck.getByRole('radio', { name: 'History' }));
    expect(deck.queryByRole('button', { name: 'Save 1 change' })).not.toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('radio', { name: 'Cards' }));
    expect(deck.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
  });

  test('a save that fails says so and keeps the changes', async () => {
    const deck = await openDeck({ Island: 8 });
    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    await step(deck, 'Add one Plains');
    failDeckWrites(1);

    await fireEvent.press(deck.getByRole('button', { name: 'Save 1 change' }));

    expect(presentedAlert()).toEqual({ title: 'Could not save the basic lands', message: 'Check your connection.', buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(deck.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
    expect(deck.getByLabelText('Plains, 1')).toHaveTextContent('1');
  });
});
