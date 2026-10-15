import { fireEvent, screen, within } from 'expo-router/testing-library';

import {
  deckWritesSent,
  decksOnTheServer,
  failDeckReads,
  failDeckWrites,
  ownDecks,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  dashedOutlinesColored,
  headerButton,
  headerButtonIsDisabled,
  leftHeaderButtons,
  pressAlertWithFieldButton,
  pressHeaderButton,
  presentedAlert,
  presentedAlertWithField,
  pressTab,
  pushedScreen,
  selectedTab,
  swipeBackFromThePushedScreen,
  tabHeader,
  typeInAlertField,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { line, primary } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

async function openDecks() {
  await renderApp();
  await pressTab('Decks');
  return within(selectedTab());
}

async function openNameAlert() {
  await pressHeaderButton(selectedTab(), 'Create deck');
}

function createdDeckNames() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'create_deck' ? [(request as { name: string }).name] : []));
}

function decksMarkedUsed() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'mark_deck_used' ? [(request as { deck_id: string }).deck_id] : []));
}

function galleryCardNames() {
  return within(selectedTab())
    .getAllByRole('header')
    .map((title) => title.props.children as string);
}

const medium = { priority: 'medium', card_count: 0 } as const;

describe('creating a deck', () => {
  test('Decks has a Create deck bar button with a plus before the settings button', async () => {
    await openDecks();

    expect(tabHeader(selectedTab()).buttons).toEqual(['Create deck', 'Settings']);
    expect(headerButton(selectedTab(), 'Create deck')).toMatchObject({ type: 'button', symbol: 'plus' });
  });

  test('the + button opens the native alert New deck with a name field, Cancel, and Create', async () => {
    await openDecks();

    await openNameAlert();

    expect(presentedAlertWithField()).toEqual({
      title: 'New deck',
      message: 'Name your deck.',
      field: { placeholder: 'Deck name', maxLength: 64 },
      buttons: [
        { label: 'Cancel', enabled: true },
        { label: 'Create', enabled: false },
      ],
    });
  });

  test('Create is off while the trimmed name is empty', async () => {
    await openDecks();
    await openNameAlert();

    await typeInAlertField('   ');
    expect(presentedAlertWithField()?.buttons).toContainEqual({ label: 'Create', enabled: false });

    await typeInAlertField(' Atraxa');
    expect(presentedAlertWithField()?.buttons).toContainEqual({ label: 'Create', enabled: true });
  });

  test('Create creates the deck with the trimmed name and opens it on Cards', async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField('  Atraxa ');

    await pressAlertWithFieldButton('Create');

    expect(createdDeckNames()).toEqual(['Atraxa']);
    expect(presentedAlertWithField()).toBeNull();
    const deck = within(pushedScreen());
    expect(await deck.findByRole('header', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(deck.getByRole('radio', { name: 'Cards', checked: true })).toBeOnTheScreen();
    expect(deck.getByText('No cards yet')).toBeOnTheScreen();
  });

  test('Cancel creates nothing', async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField('Atraxa');

    await pressAlertWithFieldButton('Cancel');

    expect(presentedAlertWithField()).toBeNull();
    expect(createdDeckNames()).toEqual([]);
    expect(decksOnTheServer()).toEqual([]);
    expect(within(selectedTab()).getByText('No decks yet')).toBeOnTheScreen();
  });

  test('a deck that could not be created shows an alert and opens nothing', async () => {
    failDeckWrites(1);
    await openDecks();
    await openNameAlert();
    await typeInAlertField('Atraxa');

    await pressAlertWithFieldButton('Create');

    expect(presentedAlert()).toEqual({ title: 'Could not create this deck', message: 'Check your connection.', buttons: ['OK'] });
    expect(() => pushedScreen()).toThrow('No screen is pushed');
  });

  test('the alert opens again with an empty name field', async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField('Atraxa');
    await pressAlertWithFieldButton('Cancel');

    await openNameAlert();

    expect(presentedAlertWithField()?.buttons).toContainEqual({ label: 'Create', enabled: false });
  });
});

describe('the Decks empty state', () => {
  test('with no decks, Decks says so, and Create deck opens the same alert', async () => {
    const decks = await openDecks();

    expect(decks.getByLabelText('No decks yet, Create a deck, then add cards to it from your collection.')).toBeOnTheScreen();

    await fireEvent.press(decks.getByRole('button', { name: 'Create deck' }));

    expect(presentedAlertWithField()?.title).toBe('New deck');
  });

  test('a deck list that could not load says so, and Try again reads it again', async () => {
    failDeckReads(1);
    ownDecks([{ name: 'Atraxa', ...medium }]);
    const decks = await openDecks();

    expect(decks.getByText('Could not load your decks')).toBeOnTheScreen();

    await fireEvent.press(decks.getByRole('button', { name: 'Try again' }));

    expect(await decks.findByRole('button', { name: 'Atraxa, Medium priority, 0 cards' })).toBeOnTheScreen();
  });
});

describe('the commander gallery', () => {
  test('shows one card per deck, the deck used most recently first', async () => {
    ownDecks([
      { name: 'Atraxa', ...medium },
      { name: 'Kinnan', priority: 'high', card_count: 1 },
      { name: 'Yuriko', priority: 'low', card_count: 0 },
    ]);
    const decks = await openDecks();

    expect(decks.getAllByRole('button', { name: /priority/ }).map((card) => card.props.accessibilityLabel)).toEqual([
      'Yuriko, Low priority, 0 cards',
      'Kinnan, High priority, 1 card',
      'Atraxa, Medium priority, 0 cards',
    ]);
  });

  test('a gallery card is a 140 px ghost commander card with the name in card title type and the priority and card count chips', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    const decks = await openDecks();

    const card = decks.getByRole('button', { name: 'Atraxa, Medium priority, 0 cards' });
    expect(within(card).getByRole('header', { name: 'Atraxa' })).toHaveStyle({ fontSize: 20, fontWeight: '800' });
    expect(within(card).getByText('Medium priority')).toBeOnTheScreen();
    expect(within(card).getByText('0 cards')).toBeOnTheScreen();
    expect(within(card).getByRole('header', { name: 'Atraxa' }).parent).toHaveStyle({ height: 140 });
    expect(dashedOutlinesColored(card, line)).toBe(1);
  });

  test('tapping a gallery card opens that deck, which then comes first in the gallery', async () => {
    ownDecks([
      { name: 'Atraxa', ...medium },
      { name: 'Kinnan', ...medium },
    ]);
    const decks = await openDecks();
    expect(galleryCardNames()).toEqual(['Kinnan', 'Atraxa']);

    await fireEvent.press(decks.getByRole('button', { name: 'Atraxa, Medium priority, 0 cards' }));

    expect(await within(pushedScreen()).findByRole('header', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(decksMarkedUsed()).toEqual(['deck-1']);

    await swipeBackFromThePushedScreen();

    expect(await decks.findByRole('button', { name: 'Atraxa, Medium priority, 0 cards' })).toBeOnTheScreen();
    expect(galleryCardNames()).toEqual(['Atraxa', 'Kinnan']);
  });
});

describe('the deck screen', () => {
  async function openDeck(name = 'Atraxa') {
    const decks = await openDecks();
    await fireEvent.press(decks.getByRole('button', { name: new RegExp(`^${name},`) }));
    const deck = within(pushedScreen());
    await deck.findByRole('header', { name });
    return deck;
  }

  test('is pushed over the tab bar with a 200 px ghost commander banner, the name, and the chips', async () => {
    ownDecks([{ name: 'Atraxa', priority: 'high', card_count: 0 }]);

    const deck = await openDeck();

    const title = deck.getByRole('header', { name: 'Atraxa' });
    expect(title).toHaveStyle({ fontSize: 20, fontWeight: '800' });
    expect(title.parent).toHaveStyle({ height: 200 });
    expect(deck.getByText('High priority')).toBeOnTheScreen();
    expect(deck.getByText('0 cards')).toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('header', { name: 'Atraxa' })).not.toBeOnTheScreen();
  });

  test('has Close on the left and a More button on the right, and Close goes back to the gallery', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    await openDeck();

    expect(leftHeaderButtons(pushedScreen())).toEqual(['Close']);
    expect(headerButton(pushedScreen(), 'Close')).toMatchObject({ type: 'button', symbol: 'xmark' });
    expect(tabHeader(pushedScreen()).buttons).toEqual(['More']);
    expect(headerButton(pushedScreen(), 'More')).toMatchObject({ symbol: 'ellipsis' });
    expect(headerButtonIsDisabled(pushedScreen(), 'More')).toBe(true);

    await pressHeaderButton(pushedScreen(), 'Close');

    expect(() => pushedScreen()).toThrow('No screen is pushed');
    expect(tabHeader(selectedTab()).title).toBe('Decks');
  });

  test('the segmented control switches between Cards and History', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    const deck = await openDeck();
    expect(deck.getByRole('radio', { name: 'Cards', checked: true })).toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('radio', { name: 'History' }));

    expect(deck.getByRole('radio', { name: 'History', checked: true })).toBeOnTheScreen();
    expect(deck.getByText('Created 15 October 2026')).toBeOnTheScreen();
    expect(deck.queryByText('No cards yet')).not.toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('radio', { name: 'Cards' }));

    expect(deck.getByText('No cards yet')).toBeOnTheScreen();
  });

  test('an empty deck says it has no commander and no cards, and Open Collection opens the Collection tab', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    const deck = await openDeck();

    const commander = deck.getByRole('header', { name: 'Commander' });
    expect(commander).toHaveStyle({ color: primary });
    expect(appearsBefore(commander, deck.getByText('No commander yet.'))).toBe(true);
    expect(deck.getByLabelText("No cards yet, Add cards from a copy's page in your collection.")).toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('button', { name: 'Open Collection' }));

    expect(() => pushedScreen()).toThrow('No screen is pushed');
    expect(tabHeader(selectedTab()).title).toBe('Collection');
  });

  test('a deck that could not load says so, keeps Close, and Try again reads it again', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    const decks = await openDecks();
    failDeckReads(1);

    await fireEvent.press(decks.getByRole('button', { name: /^Atraxa,/ }));

    const deck = within(pushedScreen());
    expect(await deck.findByText('Could not load this deck')).toBeOnTheScreen();
    expect(leftHeaderButtons(pushedScreen())).toEqual(['Close']);

    await fireEvent.press(deck.getByRole('button', { name: 'Try again' }));

    expect(await deck.findByRole('header', { name: 'Atraxa' })).toBeOnTheScreen();
  });
});
