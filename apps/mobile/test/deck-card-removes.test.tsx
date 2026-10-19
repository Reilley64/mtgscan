import { fireEvent, screen, within } from 'expo-router/testing-library';

import { copyOf, delver, openDeckNamed } from './copies';
import {
  decksOnTheServer,
  deckWritesSent,
  failDeckWrites,
  ownDeckOfCopies,
  removeDeckCardOnTheServer,
  startSignedIn,
} from './fake-supabase';
import {
  buttonMenuActions,
  contextMenu,
  headerMenuRows,
  pressAlertButton,
  pressButtonMenuAction,
  pressHeaderButton,
  pressHeaderMenuAction,
  presentedAlert,
  pressTab,
  pushedScreen,
  selectedTab,
} from './native-ui';
import { renderApp } from './render-app';

const curator = copyOf('copy-1');

beforeEach(() => {
  startSignedIn();
});

function removedCards() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'remove_deck_card' ? [request] : []));
}

async function openDeck() {
  await renderApp();
  await pressTab('Decks');
  return openDeckNamed('Atraxa');
}

async function openCopyPageFromDeck() {
  const deck = await openDeck();
  await fireEvent.press(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' }));
  await within(pushedScreen()).findByRole('header', { name: 'Price' });
}

function actionsMenuRows() {
  return headerMenuRows(pushedScreen(), 'More').map((row) => row.title);
}

describe('the long-press menu on the Cards tab', () => {
  test('a long press on a deck card ends with Remove from deck in red', async () => {
    ownDeckOfCopies('Atraxa', [curator]);

    const deck = await openDeck();

    expect(buttonMenuActions(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })))).toEqual([
      { title: 'Open card', symbol: 'rectangle.portrait', destructive: false },
      { title: 'Make commander', symbol: 'crown', destructive: false },
      { title: 'Remove from deck', symbol: 'minus.circle', destructive: true },
    ]);
  });

  test('Open card opens the copy page', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    const deck = await openDeck();

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Open card');

    expect(await within(pushedScreen()).findByRole('header', { name: 'Price' })).toBeOnTheScreen();
  });

  test('Remove from deck removes the card at once with no confirmation, and Cards no longer shows it', async () => {
    ownDeckOfCopies('Atraxa', [curator, delver]);
    const deck = await openDeck();

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');

    expect(removedCards()).toEqual([{ copy_id: 'copy-1' }]);
    expect(presentedAlert()).toBeNull();
    expect(await deck.findByRole('header', { name: 'Creatures, 1' })).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: 'Angelic Curator, MH2 262' })).not.toBeOnTheScreen();
    expect(deck.getByRole('button', { name: 'Delver of Secrets // Insectile Aberration, ISD 51' })).toBeOnTheScreen();
  });

  test('after a remove, the gallery card counts one card less', async () => {
    ownDeckOfCopies('Atraxa', [curator, delver]);
    const deck = await openDeck();

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');
    await deck.findByRole('header', { name: 'Creatures, 1' });
    await pressHeaderButton(pushedScreen(), 'Close');

    expect(await within(selectedTab()).findByRole('button', { name: 'Atraxa, Invalid, Estimated bracket 2' })).toBeOnTheScreen();
  });

  test('removing the last card shows the empty deck', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    const deck = await openDeck();

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');

    expect(await deck.findByText('No cards yet')).toBeOnTheScreen();
  });

  test('a remove that fails says so and keeps the card', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    const deck = await openDeck();
    failDeckWrites(1);

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');

    expect(presentedAlert()).toEqual({ title: 'Could not remove this card', message: 'Check your connection.', buttons: ['OK'] });
    expect(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })).toBeOnTheScreen();
    expect(decksOnTheServer()[0]!.cards).toHaveLength(1);
  });

  test('a card that was already removed on another phone leaves Cards with no alert', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    const deck = await openDeck();
    removeDeckCardOnTheServer('copy-1');

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');

    expect(presentedAlert()).toBeNull();
    expect(await deck.findByText('No cards yet')).toBeOnTheScreen();
  });
});

describe('Remove from deck on the copy page', () => {
  test('Remove from deck removes the copy at once, the deck tag goes, and the copy is free', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    await openCopyPageFromDeck();

    await pressHeaderMenuAction(pushedScreen(), 'More', ['Remove from deck']);

    expect(removedCards()).toEqual([{ copy_id: 'copy-1' }]);
    expect(presentedAlert()).toBeNull();
    expect(within(pushedScreen()).queryByRole('button', { name: 'Atraxa' })).not.toBeOnTheScreen();
    expect(actionsMenuRows()).toEqual(['Protect', 'Add to deck', 'Delete copy']);
  });

  test('going back to the deck after the remove shows the deck without the card', async () => {
    ownDeckOfCopies('Atraxa', [curator, delver]);
    await openCopyPageFromDeck();
    await pressHeaderMenuAction(pushedScreen(), 'More', ['Remove from deck']);

    await pressHeaderButton(pushedScreen(), 'Close');

    const deck = within(pushedScreen());
    expect(await deck.findByRole('header', { name: 'Creatures, 1' })).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: 'Angelic Curator, MH2 262' })).not.toBeOnTheScreen();
  });

  test('a remove that fails says Could not remove this card, and the copy stays in the deck', async () => {
    ownDeckOfCopies('Atraxa', [curator]);
    await openCopyPageFromDeck();
    failDeckWrites(1);

    await pressHeaderMenuAction(pushedScreen(), 'More', ['Remove from deck']);

    expect(presentedAlert()).toEqual({ title: 'Could not remove this card', message: 'Check your connection.', buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(within(pushedScreen()).getByRole('button', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(screen.queryByText('No cards yet')).not.toBeOnTheScreen();
  });
});
