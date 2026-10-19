import type { DeckChange, DeckChangeBasicLandLine, DeckChangeCopyLine, DeckChangeKind } from '@mtgscan/supabase/decks';
import { fireEvent, within } from 'expo-router/testing-library';

import { expirePageCursors, failDeckChangeReads, ownDeckChanges, ownDecks, startSignedIn } from './fake-supabase';
import { appearsBefore, cardImageUri, pressTab, pushedScreen, scrollToEnd, selectedTab } from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

const { incoming, outgoing } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

function copyLine(name: string, typeLine: string, places: Pick<DeckChangeCopyLine, 'place_before' | 'place_after'>): DeckChangeCopyLine {
  return {
    kind: 'copy',
    copy_id: `copy-${name}`,
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${name}.jpg`],
    type_line: typeLine,
    ...places,
  };
}

function basicLandLine(name: string, counts: Pick<DeckChangeBasicLandLine, 'count_before' | 'count_after'>): DeckChangeBasicLandLine {
  return {
    kind: 'basic_land',
    oracle_id: `oracle-${name}`,
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${name}.jpg`],
    ...counts,
  };
}

const solRing = (places: Pick<DeckChangeCopyLine, 'place_before' | 'place_after'>) => copyLine('Sol Ring', 'Artifact', places);

function deckChange(revision: number, kind: DeckChangeKind, lines: DeckChange['lines'] = [], changes: Partial<DeckChange> = {}): DeckChange {
  return {
    deck_change_id: `deck-change-${revision}`,
    revision,
    kind,
    changed_at: new Date(2026, 9, 15, 9, revision).toISOString(),
    reverted: false,
    reason: null,
    lines,
    ...changes,
  };
}

async function openHistory(changes: DeckChange[]) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: 0 }]);
  ownDeckChanges('deck-1', changes);
  await renderApp();
  await pressTab('Decks');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: /^Atraxa(,|$)/ }));
  const deck = within(pushedScreen());
  await fireEvent.press(await deck.findByRole('radio', { name: 'History' }));
  return deck;
}

describe('the History tab', () => {
  test('shows one surface card per deck change, newest first, with its kind and time, and ends with the created line', async () => {
    const deck = await openHistory([
      deckChange(2, 'removed', [solRing({ place_before: 'main', place_after: null })], { changed_at: new Date(2026, 9, 16, 18, 5).toISOString() }),
      deckChange(1, 'added', [solRing({ place_before: null, place_after: 'main' })], { changed_at: new Date(2026, 9, 15, 9, 41).toISOString() }),
    ]);

    const removed = await deck.findByText('Removed');
    const added = deck.getByText('Added');
    expect(removed).toHaveStyle({ fontSize: 14, fontWeight: '700' });
    expect(deck.getByText('16 October 2026 at 18:05')).toHaveStyle({ fontSize: 12, color: tokenColors.textMuted });
    expect(deck.getByText('15 October 2026 at 09:41')).toBeOnTheScreen();
    expect(appearsBefore(removed, added)).toBe(true);
    const created = deck.getByText('Created 15 October 2026');
    expect(created).toHaveStyle({ fontSize: 12, color: tokenColors.textMuted });
    expect(appearsBefore(added, created)).toBe(true);
  });

  test.each<[DeckChangeKind, string]>([
    ['added', 'Added'],
    ['removed', 'Removed'],
    ['made_commander', 'Made commander'],
    ['made_partner', 'Made partner'],
    ['moved_to_main_deck', 'Moved to main deck'],
    ['basic_lands', 'Basic lands'],
    ['removed_from_collection', 'Removed from collection'],
    ['revert', 'Revert'],
    ['swapped_in', 'Swapped in'],
    ['bought', 'Bought'],
  ])('the deck change kind %s reads "%s"', async (kind, name) => {
    const deck = await openHistory([deckChange(1, kind)]);

    const texts = await deck.findAllByText(name);
    const revertLabel = within(deck.getByRole('button', { name: 'Revert' })).getByText('Revert');
    expect(texts.filter((text) => text !== revertLabel)).toHaveLength(1);
  });

  test.each<DeckChangeKind>(['swapped_in', 'bought'])('a %s deck change shows its reason in body text after its change lines, with no meta line', async (kind) => {
    const reason = 'Cheap removal that also answers an early threat.';
    const deck = await openHistory([deckChange(1, kind, [solRing({ place_before: null, place_after: 'main' })], { reason })]);

    const shownReason = await deck.findByText(reason);
    expect(shownReason).toHaveStyle({ fontSize: 14, color: tokenColors.text });
    expect(appearsBefore(deck.getByLabelText('+, Sol Ring, Artifact'), shownReason)).toBe(true);
    const texts = deck.getAllByText(/./);
    expect(texts[texts.indexOf(shownReason) + 1]).toHaveTextContent(/^Created /);
  });

  test('a copy that comes into the deck is a green + line, and one that leaves is a red − line, with the thumbnail, the name, and the type line', async () => {
    const deck = await openHistory([
      deckChange(1, 'revert', [
        copyLine('Cyclonic Rift', 'Instant', { place_before: 'main', place_after: null }),
        solRing({ place_before: null, place_after: 'main' }),
      ]),
    ]);

    const comesIn = await deck.findByLabelText('+, Sol Ring, Artifact');
    const leaves = deck.getByLabelText('−, Cyclonic Rift, Instant');
    expect(within(comesIn).getByText('+')).toHaveStyle({ color: incoming });
    expect(within(leaves).getByText('−')).toHaveStyle({ color: outgoing });
    expect(within(comesIn).getByText('Sol Ring')).toBeOnTheScreen();
    expect(within(comesIn).getByText('Artifact')).toHaveStyle({ color: tokenColors.textMuted });
    expect(cardImageUri(comesIn)).toBe('https://cards.scryfall.io/normal/front/Sol Ring.jpg');
  });

  test('a commander change shows Commander or Main deck as its meta', async () => {
    const deck = await openHistory([
      deckChange(2, 'moved_to_main_deck', [copyLine('Kinnan, Bonder Prodigy', 'Legendary Creature — Human Druid', { place_before: 'commander', place_after: 'main' })]),
      deckChange(1, 'made_commander', [copyLine('Atraxa, Praetors\' Voice', 'Legendary Creature — Phyrexian Angel Horror', { place_before: 'main', place_after: 'commander' })]),
    ]);

    expect(await deck.findByLabelText('+, Kinnan, Bonder Prodigy, Main deck')).toBeOnTheScreen();
    expect(deck.getByLabelText("+, Atraxa, Praetors' Voice, Commander")).toBeOnTheScreen();
  });

  test('a commander that a revert brings back shows Commander as its meta', async () => {
    const deck = await openHistory([
      deckChange(1, 'revert', [copyLine('Kinnan, Bonder Prodigy', 'Legendary Creature — Human Druid', { place_before: null, place_after: 'commander' })]),
    ]);

    expect(await deck.findByLabelText('+, Kinnan, Bonder Prodigy, Commander')).toBeOnTheScreen();
  });

  test('a basic land line shows its count change', async () => {
    const deck = await openHistory([
      deckChange(1, 'basic_lands', [
        basicLandLine('Island', { count_before: 8, count_after: 6 }),
        basicLandLine('Snow-Covered Island', { count_before: 0, count_after: 2 }),
      ]),
    ]);

    const comesIn = await deck.findByLabelText('+, Snow-Covered Island, +2');
    const leaves = deck.getByLabelText('−, Island, −2');
    expect(within(comesIn).getByText('+')).toHaveStyle({ color: incoming });
    expect(within(comesIn).getByText('+2')).toHaveStyle({ color: tokenColors.textMuted });
    expect(within(leaves).getByText('−')).toHaveStyle({ color: outgoing });
    expect(cardImageUri(leaves)).toBe('https://cards.scryfall.io/normal/front/Island.jpg');
  });

  test('a reverted deck change keeps a Reverted chip after its kind', async () => {
    const deck = await openHistory([deckChange(2, 'revert'), deckChange(1, 'added', [], { reverted: true })]);

    const chip = await deck.findByLabelText('Reverted');
    expect(appearsBefore(deck.getByText('Added'), chip)).toBe(true);
    expect(within(chip).getByText('Reverted')).toHaveStyle({ fontSize: 11 });
    expect(deck.getAllByLabelText('Reverted')).toHaveLength(1);
  });

  test('loads more deck changes on scroll, and the created line stays last', async () => {
    const deck = await openHistory(
      Array.from({ length: 25 }, (_, index) => deckChange(25 - index, 'added', [copyLine(`Card ${25 - index}`, 'Artifact', { place_before: null, place_after: 'main' })])),
    );
    expect(await deck.findByLabelText('+, Card 6, Artifact')).toBeOnTheScreen();
    expect(deck.queryByLabelText('+, Card 5, Artifact')).not.toBeOnTheScreen();

    await scrollToEnd(pushedScreen());

    const last = await deck.findByLabelText('+, Card 1, Artifact');
    expect(deck.getAllByText('Added')).toHaveLength(25);
    expect(appearsBefore(last, deck.getByText('Created 15 October 2026'))).toBe(true);
  });

  test('an expired cursor reads History again from the newest deck change, and scrolling loads more', async () => {
    const deck = await openHistory(
      Array.from({ length: 25 }, (_, index) => deckChange(25 - index, 'added', [copyLine(`Card ${25 - index}`, 'Artifact', { place_before: null, place_after: 'main' })])),
    );
    expect(await deck.findByLabelText('+, Card 6, Artifact')).toBeOnTheScreen();
    expirePageCursors();

    await scrollToEnd(pushedScreen());
    await scrollToEnd(pushedScreen());

    expect(await deck.findByLabelText('+, Card 1, Artifact')).toBeOnTheScreen();
    expect(deck.getAllByText('Added')).toHaveLength(25);
  });

  test('a history read that fails says so, and Try again loads it', async () => {
    failDeckChangeReads(1);
    const deck = await openHistory([deckChange(1, 'added', [solRing({ place_before: null, place_after: 'main' })])]);

    expect(await deck.findByText('Could not load this deck')).toBeOnTheScreen();

    await fireEvent.press(deck.getByRole('button', { name: 'Try again' }));

    expect(await deck.findByLabelText('+, Sol Ring, Artifact')).toBeOnTheScreen();
    expect(deck.getByText('Created 15 October 2026')).toBeOnTheScreen();
  });
});
