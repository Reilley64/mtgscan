import type { Deck, DeckCard, DeckEvaluation, DeckEvaluationCard } from '@mtgscan/supabase/decks';
import { fireEvent, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { copyOf, deckCardOf, openDeckNamed } from './copies';
import { basicLandsOf, ownDeckOfCopies, ownDecks, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  cardImageOutline,
  contextMenu,
  imageSources,
  pressButtonMenuAction,
  pressHeaderButton,
  pressTab,
  presentedDrawer,
  presentedDrawerContent,
  pushedScreen,
  selectedTab,
  symbolNames,
  symbolTintColors,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { text: white, textMuted, danger, warning } = tokenColors;

const transparent = '#00000000';

const kinnan = { copy_id: 'copy-kinnan', name: 'Kinnan, Bonder Prodigy', art_crop_uri: null };

const solRing: DeckEvaluationCard = {
  kind: 'copy',
  copy_id: 'copy-sol-ring',
  name: 'Sol Ring',
  image_uris: ['https://cards.scryfall.io/normal/front/sol-ring.jpg'],
};

function evaluationOf(fields: Pick<DeckEvaluation, 'validity'> & Partial<DeckEvaluation>): DeckEvaluation {
  return {
    violations: [],
    undetermined: [],
    revision: 1,
    catalog_at: '2026-10-12T06:00:00.000Z',
    judged_at: '2026-10-15T09:00:00.000Z',
    validity_rules_data_at: '2026-10-12T06:00:00.000Z',
    ...fields,
  };
}

const cannotBeDetermined = evaluationOf({
  validity: 'cannot_be_determined',
  undetermined: [{ rule: 'deck_size', reason: 'No rules data for Sol Ring.', cards: [solRing] }],
});

type ValidityState = [string, Pick<Deck, 'card_count'> & Partial<Pick<Deck, 'commanders' | 'evaluation'>>, string, string, string];

const validityStates: ValidityState[] = [
  ['a valid deck', { card_count: 100, commanders: [kinnan] }, 'Valid', 'checkmark', white],
  ['an invalid deck', { card_count: 87 }, 'Invalid', 'nosign', danger],
  ['a deck that cannot be determined', { card_count: 100, commanders: [kinnan], evaluation: cannotBeDetermined }, 'Cannot be determined', 'questionmark', warning],
];

beforeEach(() => {
  startSignedIn();
});

async function openDecks() {
  await renderApp();
  await pressTab('Decks');
  return within(selectedTab());
}

async function openDeck(name = 'Kinnan') {
  await openDecks();
  return openDeckNamed(name);
}

describe('the validity chip in the deck screen header', () => {
  test.each(validityStates)('%s shows its validity chip button after the priority and card count chips', async (_, seed, label, symbol, color) => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', ...seed }]);

    const deck = await openDeck();

    const chip = deck.getByRole('button', { name: `Deck validity, ${label}` });
    expect(within(chip).getByText(label)).toHaveStyle({ color });
    expect(symbolNames(chip)).toEqual([symbol, 'chevron.right']);
    expect(symbolTintColors(chip)).toEqual([color, color]);
    expect(appearsBefore(deck.getByText('Medium priority'), deck.getByText(`${seed.card_count} cards`))).toBe(true);
    expect(appearsBefore(deck.getByText(`${seed.card_count} cards`), chip)).toBe(true);
    expect(chip.parent).toHaveStyle({ flexWrap: 'wrap' });
  });

  test('an empty deck shows only the priority chip and 0 cards, and Cards keeps No commander yet. and No cards yet', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 0 }]);

    const deck = await openDeck();

    expect(deck.getByText('Medium priority')).toBeOnTheScreen();
    expect(deck.getByText('0 cards')).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Deck validity/ })).not.toBeOnTheScreen();
    expect(deck.getByText('No commander yet.')).toBeOnTheScreen();
    expect(deck.getByText('No cards yet')).toBeOnTheScreen();
  });
});

describe('the validity chip on the gallery card', () => {
  test.each(validityStates)('%s shows its validity chip, which is not a button, and VoiceOver reads it with the card', async (_, seed, label, symbol, color) => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', ...seed }]);

    const decks = await openDecks();

    const card = decks.getByRole('button', { name: `Kinnan, Medium priority, ${seed.card_count} cards, ${label}` });
    expect(within(card).getByText(label)).toHaveStyle({ color });
    expect(symbolNames(card)).toEqual([symbol]);
    expect(symbolTintColors(card)).toEqual([color]);
    expect(decks.getAllByRole('button', { name: /^Kinnan,/ })).toHaveLength(1);
    expect(decks.queryByRole('button', { name: new RegExp(`^(Deck validity, )?${label}$`) })).not.toBeOnTheScreen();
  });

  test('a tap anywhere on the gallery card opens the deck', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 87 }]);
    const decks = await openDecks();

    await fireEvent.press(decks.getByRole('button', { name: 'Kinnan, Medium priority, 87 cards, Invalid' }));

    expect(await within(pushedScreen()).findByRole('header', { name: 'Kinnan' })).toBeOnTheScreen();
  });

  test('an empty deck shows only the priority chip and 0 cards', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 0 }]);

    const decks = await openDecks();

    const card = decks.getByRole('button', { name: 'Kinnan, Medium priority, 0 cards' });
    expect(symbolNames(card)).toEqual([]);
  });
});

describe('the validity chip comes and goes with the cards', () => {
  test('a first basic land brings the validity chip, and removing the last one hides it again', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 0 }]);
    const deck = await openDeck();

    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    const drawer = within(presentedDrawerContent());
    await fireEvent.press(await drawer.findByRole('button', { name: 'Add one Island' }));
    await fireEvent.press(drawer.getByRole('button', { name: 'Save 1 change' }));

    expect(await deck.findByRole('button', { name: 'Deck validity, Invalid' })).toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('button', { name: 'Edit' }));
    const again = within(presentedDrawerContent());
    await fireEvent.press(await again.findByRole('button', { name: 'Remove one Island' }));
    await fireEvent.press(again.getByRole('button', { name: 'Save 1 change' }));

    expect(await deck.findByText('0 cards')).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Deck validity/ })).not.toBeOnTheScreen();
  });

  test('removing the last main deck card hides the validity chip in the header and on the gallery card', async () => {
    ownDeckOfCopies('Kinnan', [copyOf('copy-1')]);
    const deck = await openDeck();
    expect(deck.getByRole('button', { name: 'Deck validity, Invalid' })).toBeOnTheScreen();

    await pressButtonMenuAction(contextMenu(deck.getByRole('button', { name: 'Angelic Curator, MH2 262' })), 'Remove from deck');

    expect(await deck.findByText('No cards yet')).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Deck validity/ })).not.toBeOnTheScreen();

    await pressHeaderButton(pushedScreen(), 'Close');

    expect(await within(selectedTab()).findByRole('button', { name: 'Kinnan, Medium priority, 0 cards' })).toBeOnTheScreen();
  });

  test('a deck with a basic land shows the validity chip on its gallery card', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 1, basic_lands: basicLandsOf({ Island: 1 }) }]);

    const decks = await openDecks();

    expect(decks.getByRole('button', { name: 'Kinnan, Medium priority, 1 card, Invalid' })).toBeOnTheScreen();
  });
});

describe('cards that break a rule on the Cards tab', () => {
  const golos = deckCardOf('copy-golos', 'Golos, Tireless Pilgrim', 'Legendary Artifact Creature — Scout', {
    role: 'commander',
    commander_at: '2026-10-15T09:00:00.000Z',
  });
  const firstSolRing = deckCardOf('copy-sol-ring', 'Sol Ring', 'Artifact');
  const secondSolRing = deckCardOf('copy-sol-ring-2', 'Sol Ring', 'Artifact');
  const arcaneSignet = deckCardOf('copy-arcane-signet', 'Arcane Signet', 'Artifact');
  const tolabow = deckCardOf('copy-tolabow', 'Tolabow, Loch Rascal', 'Creature — Otter');
  const basicLands = basicLandsOf({ Island: 6, Mountain: 2 });

  function evaluationCardOf(card: DeckCard): DeckEvaluationCard {
    return { kind: 'copy', copy_id: card.copy_id, name: card.name, image_uris: card.image_uris };
  }

  function basicLandCardOf(name: string): DeckEvaluationCard {
    const land = basicLands.find((candidate) => candidate.name === name)!;
    return { kind: 'basic_land', oracle_id: land.oracle_id!, name, image_uris: land.image_uris };
  }

  async function openCards() {
    ownDecks([
      {
        name: 'Golos',
        priority: 'medium',
        card_count: 13,
        commanders: [{ copy_id: golos.copy_id, name: golos.name, art_crop_uri: null }],
        cards: [golos, firstSolRing, secondSolRing, arcaneSignet, tolabow],
        basic_lands: basicLands,
        evaluation: evaluationOf({
          validity: 'invalid',
          violations: [
            {
              rule: 'singleton',
              citation: 'CR 903.5b',
              message: '2 copies of Sol Ring.',
              hint: 'Remove 1 Sol Ring.',
              cards: [evaluationCardOf(firstSolRing), evaluationCardOf(secondSolRing)],
            },
            {
              rule: 'color_identity',
              citation: 'CR 903.5c',
              message: '1 card is outside Blue, Black, Red, Green, and White.',
              hint: null,
              cards: [basicLandCardOf('Mountain')],
            },
            {
              rule: 'banned',
              citation: null,
              message: 'Golos, Tireless Pilgrim is banned in Commander.',
              hint: null,
              cards: [evaluationCardOf(golos)],
            },
          ],
          undetermined: [
            { rule: 'singleton', reason: 'mtgscan cannot read the copy limit of Tolabow, Loch Rascal.', cards: [evaluationCardOf(tolabow)] },
          ],
        }),
      },
    ]);
    return openDeck('Golos');
  }

  test('a commander, a main deck card, and a basic land in a violation have the danger outline, and VoiceOver adds that they break a Commander rule', async () => {
    const deck = await openCards();

    const outlined = [
      deck.getByRole('button', { name: 'Golos, Tireless Pilgrim, MH2 262, breaks a Commander rule' }),
      ...deck.getAllByRole('button', { name: 'Sol Ring, MH2 262, breaks a Commander rule' }),
      deck.getByRole('image', { name: 'Mountain, 2, breaks a Commander rule' }),
    ];
    expect(outlined).toHaveLength(4);
    for (const tile of outlined) {
      expect(cardImageOutline(tile)).toEqual({ borderColor: danger, borderWidth: 2, borderRadius: 8 });
    }
  });

  test('a card in no violation and an undetermined card have no outline, and VoiceOver reads them as before', async () => {
    const deck = await openCards();

    const plain = [
      deck.getByRole('button', { name: 'Arcane Signet, MH2 262' }),
      deck.getByRole('button', { name: 'Tolabow, Loch Rascal, MH2 262' }),
      deck.getByRole('image', { name: 'Island, 6' }),
    ];
    for (const tile of plain) {
      expect(cardImageOutline(tile)).toMatchObject({ borderColor: transparent });
    }
  });
});

describe('the Deck validity drawer', () => {
  async function openDrawer(label: string) {
    const deck = await openDeck();
    await fireEvent.press(deck.getByRole('button', { name: `Deck validity, ${label}` }));
    const drawer = within(presentedDrawerContent());
    await drawer.findByRole('header', { name: 'Deck validity' });
    return drawer;
  }

  test('the validity chip opens the half-height Deck validity drawer, which says what it checked against in meta text', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 87 }]);

    const drawer = await openDrawer('Invalid');

    expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
    expect(drawer.getByText('Checked against the current Commander rules.')).toHaveStyle({ color: textMuted, fontSize: 12 });
  });

  test('an invalid deck shows one row per violation in order, each with its rule name in danger body strong, its citation link, its message, and its hint when it has one', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 87 }]);

    const drawer = await openDrawer('Invalid');

    const noCommander = drawer.getByText('No commander');
    const deckSize = drawer.getByText('Deck size');
    expect(noCommander).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    expect(deckSize).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    expect(drawer.getAllByRole('link').map((link) => link.props.children)).toEqual(['CR 903.3', 'CR 903.5a']);
    expect(drawer.getByText('This deck has no commander.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('87 of 100 cards.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('Add 13 cards.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(noCommander, drawer.getByText('This deck has no commander.'))).toBe(true);
    expect(appearsBefore(drawer.getByText('This deck has no commander.'), deckSize)).toBe(true);
    expect(appearsBefore(deckSize, drawer.getByText('87 of 100 cards.'))).toBe(true);
    expect(appearsBefore(drawer.getByText('87 of 100 cards.'), drawer.getByText('Add 13 cards.'))).toBe(true);
    expect(drawer.queryByText('This deck follows the Commander rules.')).not.toBeOnTheScreen();
  });

  test('a citation link opens the Comprehensive Rules on magic.wizards.com', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 101, commanders: [kinnan] }]);
    const drawer = await openDrawer('Invalid');

    await fireEvent.press(drawer.getByRole('link', { name: 'CR 903.5a' }));

    expect(openURL).toHaveBeenCalledWith('https://magic.wizards.com/en/rules');
    expect(drawer.getByText('101 of 100 cards.')).toBeOnTheScreen();
    expect(drawer.getByText('Remove 1 card.')).toBeOnTheScreen();
    expect(drawer.queryByText('No commander')).not.toBeOnTheScreen();
  });

  test('a singleton violation shows the Singleton row with its CR link, its message, its cards, and its hint', async () => {
    const secondSolRing: DeckEvaluationCard = { ...solRing, copy_id: 'copy-sol-ring-2' };
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'invalid',
          violations: [
            {
              rule: 'singleton',
              citation: 'CR 903.5b',
              message: '2 copies of Sol Ring.',
              hint: 'Remove 1 Sol Ring.',
              cards: [solRing, secondSolRing],
            },
          ],
        }),
      },
    ]);

    const drawer = await openDrawer('Invalid');

    const singleton = drawer.getByText('Singleton');
    expect(singleton).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    expect(drawer.getAllByRole('link').map((link) => link.props.children)).toEqual(['CR 903.5b']);
    expect(drawer.getByText('2 copies of Sol Ring.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getAllByLabelText('Sol Ring')).toHaveLength(2);
    const hint = drawer.getByText('Remove 1 Sol Ring.');
    expect(hint).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(singleton, drawer.getByText('2 copies of Sol Ring.'))).toBe(true);
    expect(appearsBefore(drawer.getByText('2 copies of Sol Ring.'), hint)).toBe(true);
  });

  test('a card with an unknown copy limit shows a warning Singleton row with its reason and its cards', async () => {
    const tolabow: DeckEvaluationCard = {
      kind: 'copy',
      copy_id: 'copy-tolabow',
      name: 'Tolabow, Loch Rascal',
      image_uris: ['https://cards.scryfall.io/normal/front/tolabow.jpg'],
    };
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'cannot_be_determined',
          undetermined: [
            {
              rule: 'singleton',
              reason: 'mtgscan cannot read the copy limit of Tolabow, Loch Rascal.',
              cards: [tolabow, { ...tolabow, copy_id: 'copy-tolabow-2' }],
            },
          ],
        }),
      },
    ]);

    const drawer = await openDrawer('Cannot be determined');

    expect(drawer.getByText('Singleton')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(drawer.getByText('mtgscan cannot read the copy limit of Tolabow, Loch Rascal.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getAllByLabelText('Tolabow, Loch Rascal')).toHaveLength(2);
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
  });

  test('a violation shows its cards as thumbnail chips that are not buttons', async () => {
    const island: DeckEvaluationCard = {
      kind: 'basic_land',
      oracle_id: 'oracle-island',
      name: 'Island',
      image_uris: ['https://cards.scryfall.io/normal/front/island.jpg'],
    };
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'invalid',
          violations: [{ rule: 'deck_size', citation: 'CR 903.5a', message: '2 cards break this rule.', hint: null, cards: [solRing, island] }],
        }),
      },
    ]);

    const drawer = await openDrawer('Invalid');

    expect(imageSources(drawer.getByLabelText('Sol Ring'))).toEqual(['https://cards.scryfall.io/normal/front/sol-ring.jpg']);
    expect(imageSources(drawer.getByLabelText('Island'))).toEqual(['https://cards.scryfall.io/normal/front/island.jpg']);
    expect(drawer.queryByRole('button', { name: /Sol Ring|Island/ })).not.toBeOnTheScreen();
  });

  test('Banned and Not legal show as two rows in danger with no link', async () => {
    const swordOfDungeonsAndDragons: DeckEvaluationCard = {
      kind: 'copy',
      copy_id: 'copy-sword',
      name: 'Sword of Dungeons & Dragons',
      image_uris: ['https://cards.scryfall.io/normal/front/sword.jpg'],
    };
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'invalid',
          violations: [
            { rule: 'banned', citation: null, message: 'Sol Ring is banned in Commander.', hint: null, cards: [solRing] },
            {
              rule: 'not_legal',
              citation: null,
              message: 'Sword of Dungeons & Dragons is not legal in Commander.',
              hint: null,
              cards: [swordOfDungeonsAndDragons],
            },
          ],
        }),
      },
    ]);

    const drawer = await openDrawer('Invalid');

    expect(drawer.getByText('Banned')).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    expect(drawer.getByText('Not legal')).toHaveStyle({ color: danger, fontSize: 14, fontWeight: '700' });
    expect(drawer.getByText('Sol Ring is banned in Commander.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('Sword of Dungeons & Dragons is not legal in Commander.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByLabelText('Sol Ring')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Sword of Dungeons & Dragons')).toBeOnTheScreen();
    expect(appearsBefore(drawer.getByText('Banned'), drawer.getByText('Not legal'))).toBe(true);
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
  });

  test('a legality check with no rules data shows a Legality row in warning with its reason and its cards', async () => {
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'cannot_be_determined',
          undetermined: [{ rule: 'legality', reason: 'No rules data for Sol Ring.', cards: [solRing] }],
        }),
      },
    ]);

    const drawer = await openDrawer('Cannot be determined');

    expect(drawer.getByText('Legality')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(drawer.getByText('No rules data for Sol Ring.')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Sol Ring')).toBeOnTheScreen();
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
  });

  test('a deck that cannot be determined shows one warning row per undetermined check, with its rule name, its reason, and its cards', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 100, commanders: [kinnan], evaluation: cannotBeDetermined }]);

    const drawer = await openDrawer('Cannot be determined');

    expect(drawer.getByText('Deck size')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(drawer.getByText('No rules data for Sol Ring.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByLabelText('Sol Ring')).toBeOnTheScreen();
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
    expect(drawer.queryByText('This deck follows the Commander rules.')).not.toBeOnTheScreen();
  });

  test('a valid deck says that it follows the Commander rules, in place of the rows', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 100, commanders: [kinnan] }]);

    const drawer = await openDrawer('Valid');

    expect(drawer.getByText('This deck follows the Commander rules.')).toBeOnTheScreen();
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
  });

  test('the last line gives the day of the rules data in meta text', async () => {
    ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: 87 }]);

    const drawer = await openDrawer('Invalid');

    const rulesData = drawer.getByText('Rules data as of 12 October 2026');
    expect(rulesData).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(drawer.getByText('Add 13 cards.'), rulesData)).toBe(true);
  });

  test('with no rules data time, the drawer leaves out the rules data line', async () => {
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({ validity: 'valid', catalog_at: null, validity_rules_data_at: null }),
      },
    ]);

    const drawer = await openDrawer('Valid');

    expect(drawer.getByText('This deck follows the Commander rules.')).toBeOnTheScreen();
    expect(drawer.queryByText(/^Rules data as of/)).not.toBeOnTheScreen();
  });
});

describe('commander eligibility and partner in the Deck validity drawer', () => {
  const lightningBolt: DeckEvaluationCard = {
    kind: 'copy',
    copy_id: 'copy-lightning-bolt',
    name: 'Lightning Bolt',
    image_uris: ['https://cards.scryfall.io/normal/front/lightning-bolt.jpg'],
  };
  const tymna: DeckEvaluationCard = {
    kind: 'copy',
    copy_id: 'copy-tymna',
    name: 'Tymna the Weaver',
    image_uris: ['https://cards.scryfall.io/normal/front/tymna.jpg'],
  };
  const krenko: DeckEvaluationCard = {
    kind: 'copy',
    copy_id: 'copy-krenko',
    name: 'Krenko, Mob Boss',
    image_uris: ['https://cards.scryfall.io/normal/front/krenko.jpg'],
  };

  async function openDrawer(label: string) {
    const deck = await openDeck();
    await fireEvent.press(deck.getByRole('button', { name: `Deck validity, ${label}` }));
    const drawer = within(presentedDrawerContent());
    await drawer.findByRole('header', { name: 'Deck validity' });
    return drawer;
  }

  test('a refused commander and a refused pair show the Commander eligibility and Partner rows in danger with their CR links and cards', async () => {
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'invalid',
          violations: [
            {
              rule: 'commander_eligibility',
              citation: 'CR 903.3',
              message: 'Lightning Bolt cannot be your commander.',
              hint: null,
              cards: [lightningBolt],
            },
            {
              rule: 'partner',
              citation: 'CR 702.124',
              message: 'Tymna the Weaver and Krenko, Mob Boss cannot be commanders together.',
              hint: null,
              cards: [tymna, krenko],
            },
          ],
        }),
      },
    ]);

    const drawer = await openDrawer('Invalid');

    const eligibility = drawer.getByText('Commander eligibility');
    const pair = drawer.getByText('Partner');
    expect(eligibility).toHaveStyle({ color: danger, fontWeight: '700' });
    expect(pair).toHaveStyle({ color: danger, fontWeight: '700' });
    expect(drawer.getAllByRole('link').map((link) => link.props.children)).toEqual(['CR 903.3', 'CR 702.124']);
    expect(appearsBefore(eligibility, drawer.getByText('Lightning Bolt cannot be your commander.'))).toBe(true);
    expect(appearsBefore(drawer.getByText('Lightning Bolt cannot be your commander.'), pair)).toBe(true);
    expect(appearsBefore(pair, drawer.getByText('Tymna the Weaver and Krenko, Mob Boss cannot be commanders together.'))).toBe(true);
    expect(drawer.getByLabelText('Lightning Bolt')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Tymna the Weaver')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Krenko, Mob Boss')).toBeOnTheScreen();
  });

  test('a commander with no rules data and an unreadable partner ability show warning rows, and the chip says Cannot be determined', async () => {
    ownDecks([
      {
        name: 'Kinnan',
        priority: 'medium',
        card_count: 100,
        commanders: [kinnan],
        evaluation: evaluationOf({
          validity: 'cannot_be_determined',
          undetermined: [
            { rule: 'commander_eligibility', reason: 'No rules data for Krenko, Mob Boss.', cards: [krenko] },
            { rule: 'partner', reason: 'mtgscan cannot read the partner ability of Tymna the Weaver.', cards: [tymna] },
          ],
        }),
      },
    ]);
    const deck = await openDeck();
    const chip = deck.getByRole('button', { name: 'Deck validity, Cannot be determined' });
    expect(within(chip).getByText('Cannot be determined')).toHaveStyle({ color: warning });

    await fireEvent.press(chip);
    const drawer = within(presentedDrawerContent());
    await drawer.findByRole('header', { name: 'Deck validity' });

    expect(drawer.getByText('Commander eligibility')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(drawer.getByText('Partner')).toHaveStyle({ color: warning, fontWeight: '700' });
    expect(drawer.getByText('No rules data for Krenko, Mob Boss.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('mtgscan cannot read the partner ability of Tymna the Weaver.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByLabelText('Krenko, Mob Boss')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Tymna the Weaver')).toBeOnTheScreen();
    expect(drawer.queryByRole('link')).not.toBeOnTheScreen();
  });
});
