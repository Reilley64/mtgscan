import type { Deck, DeckEvaluation, DeckEvaluationCard } from '@mtgscan/supabase/decks';
import { fireEvent, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { copyOf, openDeckNamed } from './copies';
import { basicLandsOf, ownDeckOfCopies, ownDecks, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
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
