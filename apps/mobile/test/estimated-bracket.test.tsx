import type { BracketSignal, DeckEvaluation, DeckEvaluationCard } from '@mtgscan/supabase/decks';
import { fireEvent, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { openDeckNamed } from './copies';
import { ownDecks, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  presentedDrawer,
  presentedDrawerContent,
  pressTab,
  selectedTab,
  symbolNamed,
  symbolNames,
  symbolSizes,
  symbolTintColors,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { text: white, textMuted, info, danger } = tokenColors;

function copyCard(name: string): DeckEvaluationCard {
  const key = name.toLowerCase().replaceAll(' ', '-');
  return { kind: 'copy', copy_id: `copy-${key}`, name, image_uris: [`https://cards.scryfall.io/normal/front/${key}.jpg`] };
}

const [rhysticStudy, smotheringTithe, solRing, basaltMonolith, timeWarp] = [
  'Rhystic Study',
  'Smothering Tithe',
  'Sol Ring',
  'Basalt Monolith',
  'Time Warp',
].map(copyCard) as [DeckEvaluationCard, DeckEvaluationCard, DeckEvaluationCard, DeckEvaluationCard, DeckEvaluationCard];

const signals: BracketSignal[] = [
  { kind: 'game_changers', source: 'official', count: 2, lowest_bracket: 3, cards: [rhysticStudy, smotheringTithe] },
  {
    kind: 'two_card_combo',
    source: 'heuristic',
    count: 1,
    lowest_bracket: 4,
    cards: [basaltMonolith, solRing],
    combos: [{ cards: [basaltMonolith, solRing], produced_features: ['Infinite colorless mana'], bracket_tag: 'ruthless' }],
  },
  { kind: 'extra_turns', source: 'heuristic', count: 1, lowest_bracket: 2, cards: [timeWarp] },
];

function evaluationOf(fields: Partial<DeckEvaluation>): DeckEvaluation {
  return {
    validity: 'invalid',
    validity_stale: false,
    bracket_stale: false,
    violations: [],
    undetermined: [],
    chosen_color: null,
    estimated_bracket: 4,
    bracket_signals: signals,
    missing_signal_count: 0,
    revision: 1,
    catalog_at: '2026-10-12T06:00:00.000Z',
    oracle_tags_at: '2026-10-13T06:00:00.000Z',
    commander_spellbook_at: '2026-10-14T06:00:00.000Z',
    judged_at: '2026-10-15T09:00:00.000Z',
    validity_rules_data_at: '2026-10-12T06:00:00.000Z',
    bracket_rules_data_at: '2026-10-12T06:00:00.000Z',
    no_oracle_tag_data: false,
    no_combo_data: false,
    ...fields,
  };
}

function ownKinnan(evaluation: DeckEvaluation | null = evaluationOf({})) {
  ownDecks([{ name: 'Kinnan', priority: 'medium', card_count: evaluation ? 87 : 0, evaluation }]);
}

beforeEach(() => {
  startSignedIn();
});

async function openDecks() {
  await renderApp();
  await pressTab('Decks');
  return within(selectedTab());
}

async function openDeck() {
  await openDecks();
  return openDeckNamed('Kinnan');
}

async function openDrawer(bracket = 4) {
  const deck = await openDeck();
  await fireEvent.press(deck.getByRole('button', { name: `Estimated bracket ${bracket}` }));
  const drawer = within(presentedDrawerContent());
  await drawer.findByRole('header', { name: `Estimated bracket ${bracket}` });
  return drawer;
}

describe('the bracket chip in the deck screen header', () => {
  test.each([2, 3, 4] as const)('the bracket chip shows Bracket %i in info after the validity chip, and VoiceOver reads it as Estimated bracket', async (bracket) => {
    ownKinnan(evaluationOf({ estimated_bracket: bracket }));

    const deck = await openDeck();

    const chip = deck.getByRole('button', { name: `Estimated bracket ${bracket}` });
    expect(within(chip).getByText(`Bracket ${bracket}`)).toHaveStyle({ color: info });
    expect(symbolNames(chip)).toEqual(['chevron.right']);
    expect(symbolTintColors(chip)).toEqual([info]);
    expect(appearsBefore(deck.getByRole('button', { name: 'Deck validity, Invalid' }), chip)).toBe(true);
  });

  test('an empty deck shows no bracket chip', async () => {
    ownKinnan(null);

    const deck = await openDeck();

    expect(deck.getByText('0 cards')).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: /^Estimated bracket/ })).not.toBeOnTheScreen();
    expect(deck.queryByText(/^Bracket/)).not.toBeOnTheScreen();
  });
});

describe('the bracket chip on the gallery card', () => {
  test('the gallery card shows the bracket chip as a fourth chip, which is not a button, and VoiceOver reads the card as one button', async () => {
    ownKinnan();

    const decks = await openDecks();

    const card = decks.getByRole('button', { name: 'Kinnan, Medium priority, 87 cards, Invalid, Estimated bracket 4' });
    expect(within(card).getByText('Bracket 4')).toHaveStyle({ color: info });
    expect(appearsBefore(within(card).getByText('Invalid'), within(card).getByText('Bracket 4'))).toBe(true);
    expect(decks.queryByRole('button', { name: /^(Estimated bracket 4|Bracket 4)$/ })).not.toBeOnTheScreen();
  });

  test('an empty deck shows no bracket chip on its gallery card', async () => {
    ownKinnan(null);

    const decks = await openDecks();

    const card = decks.getByRole('button', { name: 'Kinnan, Medium priority, 0 cards' });
    expect(within(card).queryByText(/^Bracket/)).not.toBeOnTheScreen();
  });
});

describe('the Estimated bracket drawer', () => {
  test('the bracket chip opens the half-height Estimated bracket drawer, which says how the signals combine in meta text', async () => {
    ownKinnan();

    const drawer = await openDrawer();

    expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
    expect(drawer.getByText('Each signal sets a lowest bracket. The highest one wins.')).toHaveStyle({ color: textMuted, fontSize: 12 });
  });

  test('each signal shows its name and count in body strong, its source in meta text, its lowest bracket in info, and its cards as thumbnail chips', async () => {
    ownKinnan();

    const drawer = await openDrawer();

    const gameChangers = drawer.getByText('Game Changers: 2');
    expect(gameChangers).toHaveStyle({ color: white, fontSize: 14, fontWeight: '700' });
    expect(drawer.getByText('official')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('Bracket 3')).toHaveStyle({ color: info });
    expect(drawer.getByLabelText('Rhystic Study')).toBeOnTheScreen();
    expect(drawer.getByLabelText('Smothering Tithe')).toBeOnTheScreen();
    expect(drawer.queryByRole('button', { name: /Rhystic Study|Smothering Tithe/ })).not.toBeOnTheScreen();
    expect(drawer.getAllByText('heuristic')).toHaveLength(2);
    const combos = drawer.getByText('Two-card combos: 1');
    const extraTurns = drawer.getByText('Extra turns: 1');
    expect(appearsBefore(gameChangers, combos)).toBe(true);
    expect(appearsBefore(combos, extraTurns)).toBe(true);
    expect(drawer.getByText('Bracket 4')).toHaveStyle({ color: info });
    expect(drawer.getByText('Bracket 2')).toHaveStyle({ color: info });
    expect(drawer.getByLabelText('Time Warp')).toBeOnTheScreen();
  });

  test('a combo row adds each combo with its produced features and its Commander Spellbook bracket tag', async () => {
    ownKinnan();

    const drawer = await openDrawer();

    const combo = drawer.getByText('Infinite colorless mana (Commander Spellbook, ruthless)');
    expect(combo).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(drawer.getByLabelText('Sol Ring'), combo)).toBe(true);
    expect(appearsBefore(combo, drawer.getByText('Extra turns: 1'))).toBe(true);
  });

  test('the drawer says a deck could be bracket 5 and links to Commander Brackets on wizards.com', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    ownKinnan();
    const drawer = await openDrawer();

    expect(drawer.getByText('Could be Bracket 5 if built for the cEDH metagame.')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(drawer.getByText('Commander Brackets are optional guidance for a pregame conversation.')).toHaveStyle({ color: textMuted });
    await fireEvent.press(drawer.getByRole('link', { name: 'Commander Brackets on wizards.com' }));

    expect(openURL).toHaveBeenCalledWith('https://magic.wizards.com/en/formats/commander');
  });

  test('the last line gives the day of the oldest rules data in meta text', async () => {
    ownKinnan();

    const drawer = await openDrawer();

    const rulesData = drawer.getByText('Rules data as of 12 October 2026');
    expect(rulesData).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(appearsBefore(drawer.getByRole('link', { name: 'Commander Brackets on wizards.com' }), rulesData)).toBe(true);
  });

  test('the last line adds the missing signals and the rules data that was never imported', async () => {
    ownKinnan(
      evaluationOf({
        estimated_bracket: 2,
        bracket_signals: [{ kind: 'game_changers', source: 'official', count: 0, lowest_bracket: 2, cards: [] }],
        missing_signal_count: 2,
        oracle_tags_at: null,
        commander_spellbook_at: null,
        no_oracle_tag_data: true,
        no_combo_data: true,
      }),
    );

    const drawer = await openDrawer(2);

    expect(drawer.getByText('Game Changers: 0')).toBeOnTheScreen();
    expect(
      drawer.getByText('Rules data as of 12 October 2026 · Signals missing for 2 cards · No Oracle tag data yet · No combo data yet'),
    ).toHaveStyle({ color: textMuted, fontSize: 12 });
  });

  test('one missing signal reads as 1 card', async () => {
    ownKinnan(evaluationOf({ missing_signal_count: 1 }));

    const drawer = await openDrawer();

    expect(drawer.getByText('Rules data as of 12 October 2026 · Signals missing for 1 card')).toBeOnTheScreen();
  });
});

describe('a stale estimated bracket', () => {
  const staleHint = 'The rules data may be out of date.';

  test('the bracket chip in the header adds the 11 px clock after its label in info, and VoiceOver adds the hint', async () => {
    ownKinnan(evaluationOf({ bracket_stale: true }));

    const deck = await openDeck();

    const chip = deck.getByRole('button', { name: 'Estimated bracket 4' });
    expect(symbolNames(chip)).toEqual(['clock', 'chevron.right']);
    expect(symbolSizes(chip)).toEqual([11, 11]);
    expect(symbolTintColors(chip)).toEqual([info, info]);
    expect(appearsBefore(within(chip).getByText('Bracket 4'), symbolNamed(chip, 'clock'))).toBe(true);
    expect(chip).toHaveProp('accessibilityHint', staleHint);
    const validityChip = deck.getByRole('button', { name: 'Deck validity, Invalid' });
    expect(symbolNames(validityChip)).toEqual(['nosign', 'chevron.right']);
    expect(validityChip.props.accessibilityHint).toBeUndefined();
  });

  test('the bracket chip on the gallery card adds the clock after its label, and VoiceOver adds the hint to the card', async () => {
    ownKinnan(evaluationOf({ bracket_stale: true }));

    const decks = await openDecks();

    const card = decks.getByRole('button', { name: 'Kinnan, Medium priority, 87 cards, Invalid, Estimated bracket 4' });
    expect(symbolNames(card)).toEqual(['nosign', 'clock']);
    expect(symbolTintColors(card)).toEqual([danger, info]);
    expect(appearsBefore(within(card).getByText('Bracket 4'), symbolNamed(card, 'clock'))).toBe(true);
    expect(card).toHaveProp('accessibilityHint', staleHint);
  });

  test('the Estimated bracket drawer adds Stale to its rules data line, before the missing signals and the data not imported yet', async () => {
    ownKinnan(evaluationOf({ bracket_stale: true, missing_signal_count: 2, commander_spellbook_at: null, no_combo_data: true }));

    const drawer = await openDrawer();

    expect(drawer.getByText('Rules data as of 12 October 2026 · Stale · Signals missing for 2 cards · No combo data yet')).toHaveStyle({
      color: textMuted,
      fontSize: 12,
    });
  });
});
