import type { DeckCard, DeckCommander } from '@mtgscan/supabase/decks';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { copyOf, deckCardOf, openCopyPage, openDeckNamed } from './copies';
import { failDeckWrites, ownCopies, ownDecks, startSignedIn } from './fake-supabase';
import { requestsSent } from './fake-supabase-controls';
import {
  buttonMenuActions,
  contextMenu,
  dashedOutlinesColored,
  fadesDown,
  headerMenu,
  headerMenuRows,
  imageFrames,
  placeInScrollView,
  presentedAlert,
  pressButtonMenuAction,
  pressHeaderMenuAction,
  pressTab,
  pushedScreen,
  selectedTab,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { line } = tokenColors;

const atraxaArt = 'https://cards.scryfall.io/art_crop/front/atraxa.jpg';
const kinnanArt = 'https://cards.scryfall.io/art_crop/front/kinnan.jpg';

beforeEach(() => {
  startSignedIn();
});

function commanderCardOf(copyId: string, name: string, commanderAt: string) {
  return deckCardOf(copyId, name, 'Legendary Creature', { role: 'commander', commander_at: commanderAt });
}

function commanderOf(card: DeckCard, artCropUri: string): DeckCommander {
  return { copy_id: card.copy_id, name: card.name, art_crop_uri: artCropUri };
}

const atraxa = commanderCardOf('atraxa', "Atraxa, Praetors' Voice", '2026-10-15T09:00:00.000Z');
const kinnan = commanderCardOf('kinnan', 'Kinnan, Bonder Prodigy', '2026-10-15T09:05:00.000Z');
const solRing = deckCardOf('sol-ring', 'Sol Ring', 'Artifact');

function deckWith(cards: DeckCard[], commanders: DeckCommander[]) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', cards, commanders }]);
}

async function openDeck() {
  await renderApp();
  await pressTab('Decks');
  return openDeckNamed('Atraxa');
}

function tileMenu(name: string | RegExp) {
  return contextMenu(within(pushedScreen()).getByRole('button', { name }));
}

function tileMenuTitles(name: string | RegExp) {
  return buttonMenuActions(tileMenu(name)).map((action) => action.title);
}

function commanderWrites() {
  return requestsSent('set_deck_commander');
}

function banner() {
  return placeInScrollView(within(pushedScreen()).getByRole('header', { name: 'Atraxa' })).block;
}

describe('the long-press menu', () => {
  test('with no commander, a deck card offers Open card and Make commander', async () => {
    deckWith([solRing], []);
    await openDeck();

    expect(tileMenuTitles(/^Sol Ring/)).toEqual(['Open card', 'Make commander', 'Remove from deck']);
  });

  test('with one commander, the commander offers Move to main deck and another card offers Make partner', async () => {
    deckWith([atraxa, solRing], [commanderOf(atraxa, atraxaArt)]);
    await openDeck();

    expect(tileMenuTitles(/^Atraxa/)).toEqual(['Open card', 'Move to main deck', 'Remove from deck']);
    expect(tileMenuTitles(/^Sol Ring/)).toEqual(['Open card', 'Make partner', 'Remove from deck']);
  });

  test('with two commanders, a main deck card offers neither Make item', async () => {
    deckWith([atraxa, kinnan, solRing], [commanderOf(atraxa, atraxaArt), commanderOf(kinnan, kinnanArt)]);
    await openDeck();

    expect(tileMenuTitles(/^Sol Ring/)).toEqual(['Open card', 'Remove from deck']);
    expect(tileMenuTitles(/^Kinnan/)).toEqual(['Open card', 'Move to main deck', 'Remove from deck']);
  });

  test('Make commander makes the card a commander, and it moves to the Commander group', async () => {
    deckWith([solRing], []);
    const deck = await openDeck();

    await pressButtonMenuAction(tileMenu(/^Sol Ring/), 'Make commander');

    expect(commanderWrites()).toEqual([{ copy_id: 'sol-ring', commander: true }]);
    expect(await deck.findByRole('header', { name: 'Commander, 1' })).toBeOnTheScreen();
    expect(deck.queryByRole('header', { name: 'Artifacts, 1' })).not.toBeOnTheScreen();
    expect(deck.queryByText('No commander yet.')).not.toBeOnTheScreen();
  });

  test('Make partner makes a second commander', async () => {
    deckWith([atraxa, solRing], [commanderOf(atraxa, atraxaArt)]);
    const deck = await openDeck();

    await pressButtonMenuAction(tileMenu(/^Sol Ring/), 'Make partner');

    expect(commanderWrites()).toEqual([{ copy_id: 'sol-ring', commander: true }]);
    expect(await deck.findByRole('header', { name: 'Commander, 2' })).toBeOnTheScreen();
  });

  test('Move to main deck moves the commander back to its type group', async () => {
    deckWith([atraxa, solRing], [commanderOf(atraxa, atraxaArt)]);
    const deck = await openDeck();

    await pressButtonMenuAction(tileMenu(/^Atraxa/), 'Move to main deck');

    expect(commanderWrites()).toEqual([{ copy_id: 'atraxa', commander: false }]);
    expect(await deck.findByText('No commander yet.')).toBeOnTheScreen();
    expect(deck.getByRole('header', { name: 'Creatures, 1' })).toBeOnTheScreen();
  });

  test('a commander write that fails shows an alert and changes nothing', async () => {
    deckWith([solRing], []);
    const deck = await openDeck();
    failDeckWrites(1);

    await pressButtonMenuAction(tileMenu(/^Sol Ring/), 'Make commander');

    expect(presentedAlert()).toEqual({ title: 'Could not make this card a commander', message: 'Check your connection.', buttons: ['OK'] });
    expect(deck.getByText('No commander yet.')).toBeOnTheScreen();
  });
});

describe('the Cards tab', () => {
  test('shows the commanders first, in the Commander group, oldest first', async () => {
    deckWith([solRing, kinnan, atraxa], [commanderOf(atraxa, atraxaArt), commanderOf(kinnan, kinnanArt)]);
    const deck = await openDeck();

    expect(deck.getAllByRole('header').map((header) => header.props.accessibilityLabel ?? header.props.children)).toEqual([
      'Atraxa',
      'Commander, 2',
      'Artifacts, 1',
    ]);
    expect(deck.getAllByRole('button', { name: /MH2 262/ }).map((tile) => tile.props.accessibilityLabel)).toEqual([
      "Atraxa, Praetors' Voice, MH2 262",
      'Kinnan, Bonder Prodigy, MH2 262',
      'Sol Ring, MH2 262',
    ]);
  });
});

describe('the copy page menu', () => {
  function copyInDeck(role: 'commander' | 'main', commanderCount: number) {
    const curator = deckCardOf('copy-1', 'Angelic Curator', 'Creature — Angel Spirit', {
      role,
      commander_at: role === 'commander' ? '2026-10-15T08:00:00.000Z' : null,
    });
    const otherCommanders = [atraxa, kinnan].slice(0, role === 'commander' ? commanderCount - 1 : commanderCount);
    ownCopies([copyOf('copy-1')]);
    deckWith([curator, ...otherCommanders], otherCommanders.map((card) => commanderOf(card, atraxaArt)));
  }

  function actionsMenuRows() {
    return headerMenuRows(pushedScreen(), 'More').map((row) => row.title);
  }

  test.each([
    ['main', 0, ['Make commander', 'Remove from deck', 'Delete copy']],
    ['main', 1, ['Make partner', 'Remove from deck', 'Delete copy']],
    ['commander', 1, ['Move to main deck', 'Remove from deck', 'Delete copy']],
    ['main', 2, ['Remove from deck', 'Delete copy']],
    ['commander', 2, ['Move to main deck', 'Remove from deck', 'Delete copy']],
  ] as const)('a %s deck card in a deck with %i commanders offers %j', async (role, commanderCount, rows) => {
    copyInDeck(role, commanderCount);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(rows);
  });

  test.each([
    ['main', 0, { title: 'Make commander', symbol: 'crown' }],
    ['main', 1, { title: 'Make partner', symbol: 'crown' }],
    ['commander', 1, { title: 'Move to main deck', symbol: 'rectangle.stack' }],
  ] as const)('a %s deck card in a deck with %i commanders shows a symbol before each action', async (role, commanderCount, commanderRow) => {
    copyInDeck(role, commanderCount);

    await openCopyPage(/^Angelic Curator/);

    expect(headerMenu(pushedScreen(), 'More').items).toEqual([
      commanderRow,
      { title: 'Remove from deck', symbol: 'minus.circle' },
      { title: 'Delete copy', symbol: 'trash' },
    ]);
  });

  test('Make commander makes the copy a commander, and the menu then offers Move to main deck', async () => {
    copyInDeck('main', 0);
    await openCopyPage(/^Angelic Curator/);

    await pressHeaderMenuAction(pushedScreen(), 'More', ['Make commander']);

    expect(commanderWrites()).toEqual([{ copy_id: 'copy-1', commander: true }]);
    await screen.findByRole('header', { name: 'Price' });
    expect(actionsMenuRows()).toEqual(['Move to main deck', 'Remove from deck', 'Delete copy']);
  });

  test('a commander write that fails shows an alert', async () => {
    copyInDeck('commander', 1);
    await openCopyPage(/^Angelic Curator/);
    failDeckWrites(1);

    await pressHeaderMenuAction(pushedScreen(), 'More', ['Move to main deck']);

    expect(presentedAlert()).toEqual({ title: 'Could not move this card to the main deck', message: 'Check your connection.', buttons: ['OK'] });
  });
});

describe('the banner', () => {
  test('with no commander, it is the ghost commander card with no art', async () => {
    deckWith([solRing], []);
    await openDeck();

    expect(imageFrames(banner())).toEqual([]);
    expect(banner()).toHaveStyle({ borderStyle: 'dashed', borderColor: line });
  });

  test("with one commander, it shows the commander's art crop fading into the background", async () => {
    deckWith([atraxa], [commanderOf(atraxa, atraxaArt)]);
    await openDeck();

    expect(imageFrames(banner())).toEqual([{ uri: atraxaArt, width: undefined }]);
    expect(fadesDown(banner())).toBe(true);
    expect(banner()).not.toHaveStyle({ borderStyle: 'dashed' });
  });

  test('with two commanders, the oldest is the art and the second is a 48 px avatar', async () => {
    deckWith([atraxa, kinnan], [commanderOf(atraxa, atraxaArt), commanderOf(kinnan, kinnanArt)]);
    await openDeck();

    expect(imageFrames(banner())).toEqual([
      { uri: atraxaArt, width: undefined },
      { uri: kinnanArt, width: 48 },
    ]);
  });

  test('making a commander puts its art on the banner', async () => {
    ownCopies([copyOf('sol-ring', { art_crop_uri: atraxaArt })]);
    deckWith([solRing], []);
    await openDeck();

    await pressButtonMenuAction(tileMenu(/^Sol Ring/), 'Make commander');

    await within(pushedScreen()).findByRole('header', { name: 'Commander, 1' });
    expect(imageFrames(banner())).toEqual([{ uri: atraxaArt, width: undefined }]);
  });
});

describe('the gallery card', () => {
  async function galleryCard() {
    await renderApp();
    await pressTab('Decks');
    return within(selectedTab()).getByRole('button', { name: /^Atraxa(,|$)/ });
  }

  test('with no commander, it is the ghost commander card with no art', async () => {
    deckWith([], []);

    const card = await galleryCard();

    expect(imageFrames(card)).toEqual([]);
    expect(dashedOutlinesColored(card, line)).toBe(1);
  });

  test("with one commander, it shows the commander's art crop under a dark gradient", async () => {
    deckWith([atraxa], [commanderOf(atraxa, atraxaArt)]);

    const card = await galleryCard();

    expect(imageFrames(card)).toEqual([{ uri: atraxaArt, width: undefined }]);
    expect(fadesDown(card)).toBe(true);
    expect(dashedOutlinesColored(card, line)).toBe(0);
  });

  test('with two commanders, the oldest is the art and the second is a 40 px avatar', async () => {
    deckWith([atraxa, kinnan], [commanderOf(atraxa, atraxaArt), commanderOf(kinnan, kinnanArt)]);

    const card = await galleryCard();

    expect(imageFrames(card)).toEqual([
      { uri: atraxaArt, width: undefined },
      { uri: kinnanArt, width: 40 },
    ]);
  });
});
