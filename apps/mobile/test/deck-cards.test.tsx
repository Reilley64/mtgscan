import { fireEvent, screen, within } from 'expo-router/testing-library';

import { copyOf, deckCardOf, openCopyPage, openDeckWithCards } from './copies';
import {
  allocateCopyElsewhere,
  deckWritesSent,
  failAddPreviews,
  failDeckWrites,
  holdAddPreviews,
  ownAddPreviewEffects,
  ownCopies,
  ownDecks,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  cardImageUri,
  cardSheen,
  dashedOutlinesColored,
  headerMenuRows,
  isDrawerPresented,
  pressAlertButton,
  pressHeaderMenuAction,
  presentedAlert,
  presentedDrawer,
  presentedDrawerContent,
  pushedScreen,
  scrollToEnd,
} from './native-ui';
import { tokenColors } from './token-colors';

const { line, danger } = tokenColors;

const medium = { priority: 'medium', card_count: 0 } as const;

const commanderArt = 'https://cards.scryfall.io/art_crop/front/atraxa.jpg';

beforeEach(() => {
  startSignedIn();
});

function actionsMenuRows() {
  return headerMenuRows(pushedScreen(), 'More').map((row) => row.title);
}

async function chooseAction(title: string) {
  await pressHeaderMenuAction(pushedScreen(), 'More', [title]);
}

function addedCards() {
  return deckWritesSent().flatMap(({ name, request }) => (name === 'add_deck_card' ? [request] : []));
}

function drawer() {
  return within(presentedDrawerContent());
}

describe('the copy page actions menu', () => {
  test('a free copy offers Protect, Add to deck, and Delete copy when the user has a deck', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Protect', 'Add to deck', 'Delete copy']);
  });

  test('a protected copy offers Unprotect, Add to deck, and Delete copy', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1', { protected: true })]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Unprotect', 'Add to deck', 'Delete copy']);
  });

  test('with no decks, the menu offers no Add to deck and no Create deck', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Protect', 'Delete copy']);
  });

  test('a copy in a deck offers no Protect and no Add to deck', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1', { free: false, deck: { deck_id: 'deck-1', name: 'Atraxa', role: 'main', commander_art_crop_uri: null, commander_count: 0 } })]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Make commander', 'Remove from deck', 'Delete copy']);
  });
});

describe('the Add to deck drawer', () => {
  test('opens at half height, names the copy, and lists one row per deck with its priority and card count', async () => {
    ownDecks([
      { name: 'Atraxa', priority: 'medium', card_count: 62 },
      { name: 'Kinnan', priority: 'high', card_count: 1, commanders: [{ copy_id: 'copy-9', name: 'Kinnan', art_crop_uri: commanderArt }] },
    ]);
    ownCopies([copyOf('copy-1', { finish: 'foil', condition: 'lightly_played' })]);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Add to deck');

    expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5 });
    expect(await drawer().findByRole('header', { name: 'Add to deck' })).toBeOnTheScreen();
    expect(drawer().getByText('Angelic Curator · MH2 · 262 · Foil · LP · English')).toBeOnTheScreen();
    expect(drawer().getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual([
      'Kinnan, High priority · 1 card',
      'Atraxa, Medium priority · 62 cards',
    ]);
  });

  test("a deck row shows its commander's avatar, or a dashed circle with no commander", async () => {
    ownDecks([
      { name: 'Atraxa', ...medium },
      { name: 'Kinnan', ...medium, commanders: [{ copy_id: 'copy-9', name: 'Kinnan', art_crop_uri: commanderArt }] },
    ]);
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Add to deck');

    const kinnan = await drawer().findByRole('button', { name: /^Kinnan/ });
    expect(cardImageUri(kinnan)).toBe(commanderArt);
    expect(dashedOutlinesColored(kinnan, line)).toBe(0);
    expect(dashedOutlinesColored(drawer().getByRole('button', { name: /^Atraxa/ }), line)).toBe(1);
  });

  test('a tap adds the copy to that deck, closes the drawer, and the copy page shows the deck tag', async () => {
    ownDecks([
      { name: 'Atraxa', ...medium },
      { name: 'Kinnan', ...medium },
    ]);
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    await chooseAction('Add to deck');

    await fireEvent.press(await drawer().findByRole('button', { name: /^Atraxa/ }));

    expect(addedCards()).toEqual([{ deck_id: 'deck-1', copy_id: 'copy-1', unprotect: false }]);
    expect(isDrawerPresented()).toBe(false);
    expect(await within(pushedScreen()).findByRole('button', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(actionsMenuRows()).toEqual(['Make commander', 'Remove from deck', 'Delete copy']);
  });

  test('a protected copy shows the protected alert first, and Cancel opens no drawer', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1', { protected: true })]);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Add to deck');

    expect(presentedAlert()).toEqual({
      title: 'This copy is protected.',
      message: 'Putting it in a deck unprotects it.',
      buttons: ['Unprotect and add', 'Cancel'],
    });
    await pressAlertButton('Cancel');
    expect(isDrawerPresented()).toBe(false);
    expect(addedCards()).toEqual([]);
  });

  test('Unprotect and add opens the drawer, and the add unprotects the copy', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1', { protected: true })]);
    await openCopyPage(/^Angelic Curator/);
    await chooseAction('Add to deck');

    await pressAlertButton('Unprotect and add');
    await fireEvent.press(await drawer().findByRole('button', { name: /^Atraxa/ }));

    expect(addedCards()).toEqual([{ deck_id: 'deck-1', copy_id: 'copy-1', unprotect: true }]);
    expect(await within(pushedScreen()).findByRole('button', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Protected')).not.toBeOnTheScreen();
  });

  test('a copy that is no longer free says so, closes the drawer, and reloads the page', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    await chooseAction('Add to deck');
    allocateCopyElsewhere('copy-1');

    await fireEvent.press(await drawer().findByRole('button', { name: /^Atraxa/ }));

    expect(presentedAlert()).toEqual({ title: 'This card is already in a deck.', message: undefined, buttons: ['OK'] });
    expect(isDrawerPresented()).toBe(false);
    await pressAlertButton('OK');
    expect(actionsMenuRows()).toEqual(['Delete copy']);
  });

  test('a write that fails says so and keeps the drawer open', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    await chooseAction('Add to deck');
    failDeckWrites(1);

    await fireEvent.press(await drawer().findByRole('button', { name: /^Atraxa/ }));

    expect(presentedAlert()).toEqual({ title: 'Could not add this card', message: 'Check your connection.', buttons: ['OK'] });
    expect(isDrawerPresented()).toBe(true);
  });

  test('a row with an effect shows a danger chip under its meta line, and VoiceOver reads the full effect', async () => {
    ownDecks([
      { name: 'Atraxa', ...medium },
      { name: 'Kinnan', ...medium },
      { name: 'Tymna', ...medium },
    ]);
    ownAddPreviewEffects({
      'deck-1': { kind: 'would_make_invalid', rules: [{ rule: 'deck_size' }, { rule: 'color_identity', colors: ['R'] }] },
      'deck-2': { kind: 'adds_violation', rules: [{ rule: 'singleton' }] },
    });
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Add to deck');

    const atraxa = await drawer().findByRole('button', { name: /^Atraxa/ });
    expect(atraxa.props.accessibilityLabel).toBe(
      'Atraxa, Medium priority · 0 cards, Would make Atraxa invalid: deck size, color identity, Red',
    );
    expect(within(atraxa).getByText('Would make it invalid')).toHaveStyle({ color: danger });
    expect(appearsBefore(within(atraxa).getByText('Medium priority · 0 cards'), within(atraxa).getByText('Would make it invalid'))).toBe(true);
    const kinnan = drawer().getByRole('button', { name: /^Kinnan/ });
    expect(kinnan.props.accessibilityLabel).toBe('Kinnan, Medium priority · 0 cards, Adds a violation to Kinnan: singleton');
    expect(within(kinnan).getByText('Adds a violation')).toHaveStyle({ color: danger });
    expect(drawer().getByRole('button', { name: 'Tymna, Medium priority · 0 cards' })).toBeOnTheScreen();
  });

  test('rows show no effect chip and no error while the preview loads or after it fails', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownAddPreviewEffects({ 'deck-1': { kind: 'adds_violation', rules: [{ rule: 'singleton' }] } });
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    const held = holdAddPreviews();

    await chooseAction('Add to deck');

    expect(await drawer().findByRole('button', { name: 'Atraxa, Medium priority · 0 cards' })).toBeOnTheScreen();
    expect(drawer().queryByText('Adds a violation')).not.toBeOnTheScreen();
    failAddPreviews(1);
    await held.finish();
    expect(drawer().getByRole('button', { name: 'Atraxa, Medium priority · 0 cards' })).toBeOnTheScreen();
    expect(drawer().queryByText('Adds a violation')).not.toBeOnTheScreen();
    expect(drawer().queryByText(/Could not/)).not.toBeOnTheScreen();
  });

  test('a tap on a row with an effect still adds the copy', async () => {
    ownDecks([{ name: 'Atraxa', ...medium }]);
    ownAddPreviewEffects({ 'deck-1': { kind: 'would_make_invalid', rules: [{ rule: 'banned' }] } });
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    await chooseAction('Add to deck');

    await fireEvent.press(await drawer().findByRole('button', { name: /Would make Atraxa invalid: banned$/ }));

    expect(addedCards()).toEqual([{ deck_id: 'deck-1', copy_id: 'copy-1', unprotect: false }]);
    expect(isDrawerPresented()).toBe(false);
  });
});

describe('the deck tag', () => {
  test('a copy in a deck shows the deck tag with a dashed circle, and a tap opens the deck on Cards', async () => {
    ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: 1, cards: [deckCardOf('copy-1', 'Angelic Curator', 'Creature — Angel Spirit')] }]);
    ownCopies([copyOf('copy-1', { free: false, deck: { deck_id: 'deck-1', name: 'Atraxa', role: 'main', commander_art_crop_uri: null, commander_count: 0 } })]);
    await openCopyPage(/^Angelic Curator/);

    const tag = within(pushedScreen()).getByRole('button', { name: 'Atraxa' });
    expect(dashedOutlinesColored(tag, line)).toBe(1);

    await fireEvent.press(tag);

    const deck = within(pushedScreen());
    expect(await deck.findByRole('header', { name: 'Atraxa' })).toBeOnTheScreen();
    expect(deck.getByRole('radio', { name: 'Cards', checked: true })).toBeOnTheScreen();
    expect(deck.getByRole('header', { name: 'Creatures, 1' })).toBeOnTheScreen();
  });

  test("the deck tag shows the first commander's avatar", async () => {
    ownCopies([copyOf('copy-1', { free: false, deck: { deck_id: 'deck-1', name: 'Atraxa', role: 'main', commander_art_crop_uri: commanderArt, commander_count: 1 } })]);

    await openCopyPage(/^Angelic Curator/);

    expect(cardImageUri(within(pushedScreen()).getByRole('button', { name: 'Atraxa' }))).toBe(commanderArt);
  });
});

describe('the Cards tab', () => {
  test('groups the main deck by type in order, with each group header and its count, and hides empty groups', async () => {
    const deck = await openDeckWithCards([
      deckCardOf('land', 'Command Tower', 'Land'),
      deckCardOf('instant', 'Swords to Plowshares', 'Instant'),
      deckCardOf('artifact-creature', 'Solemn Simulacrum', 'Artifact Creature — Golem'),
      deckCardOf('artifact', 'Sol Ring', 'Artifact'),
      deckCardOf('creature', 'Birds of Paradise', 'Creature — Bird'),
      deckCardOf('planeswalker', 'Teferi, Hero of Dominaria', 'Legendary Planeswalker — Teferi'),
      deckCardOf('battle', 'Invasion of Ikoria', 'Battle — Siege'),
      deckCardOf('enchantment', 'Rhystic Study', 'Enchantment'),
      deckCardOf('sorcery', 'Cultivate', 'Sorcery'),
      deckCardOf('modal', 'Sink into Stupor // Soporific Springs', 'Instant // Land'),
    ]);
    await scrollToEnd(pushedScreen());

    expect(deck.getAllByRole('header').map((header) => header.props.accessibilityLabel ?? header.props.children)).toEqual([
      'Atraxa',
      'Commander',
      'Creatures, 2',
      'Planeswalkers, 1',
      'Battles, 1',
      'Artifacts, 1',
      'Enchantments, 1',
      'Instants, 2',
      'Sorceries, 1',
      'Lands, 1',
    ]);
    expect(deck.getByText('No commander yet.')).toBeOnTheScreen();
  });

  test('sorts the cards of a group by name', async () => {
    const deck = await openDeckWithCards([
      deckCardOf('c', 'Sol Ring', 'Artifact'),
      deckCardOf('a', 'Arcane Signet', 'Artifact'),
      deckCardOf('b', 'Mind Stone', 'Artifact'),
    ]);

    expect(deck.getAllByRole('button', { name: /MH2 262/ }).map((tile) => tile.props.accessibilityLabel)).toEqual([
      'Arcane Signet, MH2 262',
      'Mind Stone, MH2 262',
      'Sol Ring, MH2 262',
    ]);
  });

  test('a commander is in the Commander group, not in its type group', async () => {
    const deck = await openDeckWithCards([
      deckCardOf('commander', 'Atraxa, Praetors\' Voice', 'Legendary Creature — Phyrexian Angel Horror', {
        role: 'commander',
        commander_at: '2026-10-15T09:00:00.000Z',
      }),
      deckCardOf('creature', 'Birds of Paradise', 'Creature — Bird'),
    ]);

    expect(deck.getByRole('header', { name: 'Commander, 1' })).toBeOnTheScreen();
    expect(deck.getByRole('header', { name: 'Creatures, 1' })).toBeOnTheScreen();
    expect(deck.queryByText('No commander yet.')).not.toBeOnTheScreen();
  });

  test('a tile is the card image with the finish sheen, and no meta line and no price', async () => {
    const deck = await openDeckWithCards([deckCardOf('foil', 'Sol Ring', 'Artifact', { finish: 'foil' })]);

    const tile = deck.getByRole('button', { name: 'Sol Ring, MH2 262, foil' });
    expect(cardImageUri(tile)).toBe('https://cards.scryfall.io/normal/front/foil.jpg');
    expect(cardSheen(tile)).not.toBeNull();
    expect(within(tile).queryAllByText(/./)).toEqual([]);
  });

  test('a tap on a tile opens its copy page', async () => {
    ownCopies([copyOf('copy-1', { free: false, deck: { deck_id: 'deck-1', name: 'Atraxa', role: 'main', commander_art_crop_uri: null, commander_count: 0 } })]);
    const deck = await openDeckWithCards([deckCardOf('copy-1', 'Angelic Curator', 'Creature — Angel Spirit')]);

    await fireEvent.press(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' }));

    expect(await within(pushedScreen()).findByRole('header', { name: 'Price' })).toBeOnTheScreen();
  });
});
