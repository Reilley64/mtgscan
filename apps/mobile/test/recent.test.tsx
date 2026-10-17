import { fireEvent, waitFor, within } from 'expo-router/testing-library';

import {
  changePlannedSwapElsewhere,
  deckWritesSent,
  failDeckWrites,
  failPlannedSwapReads,
  ownDecks,
  ownPlannedSwaps,
  plannedSwapQueries,
  startSignedIn,
} from './fake-supabase';
import { presentedAlert, pressTab, pushedScreen, selectedTab, appearsBefore, cardImageUri } from './native-ui';
import { plannedCopyLine, plannedSwapOf, reason } from './planned-swaps';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

beforeEach(() => {
  startSignedIn();
});

async function openRecent() {
  await renderApp();
  return within(selectedTab());
}

describe('Recent', () => {
  test('lists the open planned swaps oldest first, and asks for open planned swaps only', async () => {
    ownPlannedSwaps([
      plannedSwapOf('newer', { incoming: plannedCopyLine('copy-newer', 'Counterspell'), created_at: '2026-10-16T18:05:00.000Z' }),
      plannedSwapOf('older', { incoming: plannedCopyLine('copy-older', 'Lightning Bolt'), created_at: '2026-10-15T09:41:00.000Z' }),
    ]);

    const recent = await openRecent();

    const older = await recent.findByLabelText('+, Lightning Bolt, M10 146');
    expect(appearsBefore(older, recent.getByLabelText('+, Counterspell, M10 146'))).toBe(true);
    expect(plannedSwapQueries()).toContainEqual({ status: 'open', order: 'oldest_first', limit: 50 });
    expect(recent.queryByText('Nothing needs you yet')).not.toBeOnTheScreen();
  });

  test('an item shows its deck tag, its change lines with the printing, its reason, and the AI client name and time', async () => {
    ownPlannedSwaps([
      plannedSwapOf('swap', {
        incoming: plannedCopyLine('copy-new-bolt', 'Lightning Bolt', { finish: 'foil', condition: 'lightly_played' }),
        outgoing: plannedCopyLine('copy-shock', 'Shock', { set: 'm19', collector_number: '156' }),
      }),
    ]);

    const recent = await openRecent();

    const incoming = await recent.findByLabelText('+, Lightning Bolt, M10 146 · Foil · LP');
    expect(cardImageUri(incoming)).toBe('https://cards.scryfall.io/normal/front/copy-new-bolt.jpg');
    expect(recent.getByLabelText('−, Shock, M19 156')).toBeOnTheScreen();
    expect(recent.getByRole('button', { name: 'Krenko' })).toBeOnTheScreen();
    expect(recent.getByText(reason)).toHaveStyle({ fontSize: 14, color: tokenColors.text });
    expect(recent.getByText('ChatGPT · 16 October 2026 at 18:05')).toHaveStyle({ fontSize: 12, color: tokenColors.textMuted });
    expect(recent.getByRole('button', { name: 'Swap in' })).toHaveStyle({ backgroundColor: tokenColors.primary });
  });

  test('a planned swap that makes its copy a commander says so on the incoming line', async () => {
    ownPlannedSwaps([plannedSwapOf('commander', { as_commander: true, incoming: plannedCopyLine('copy-krenko', 'Krenko, Mob Boss') })]);

    const recent = await openRecent();

    expect(await recent.findByLabelText('+, Krenko, Mob Boss, M10 146 · Commander')).toBeOnTheScreen();
  });

  test('an item that would break a Commander rule shows the effect chip', async () => {
    ownPlannedSwaps([
      plannedSwapOf('breaks', { effect: { kind: 'would_make_invalid', rules: [{ rule: 'color_identity', colors: ['U'] }] } }),
    ]);

    const recent = await openRecent();

    const chip = await recent.findByLabelText('Would make Krenko invalid: color identity, Blue');
    expect(within(chip).getByText('Would make it invalid: color identity')).toHaveStyle({ color: tokenColors.danger });
  });

  test('Swap in acts at once, sends the planned swap, and the item leaves Recent', async () => {
    ownDecks([{ name: 'Krenko', priority: 'medium', card_count: 1 }]);
    ownPlannedSwaps([plannedSwapOf('swap')]);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Swap in' }));

    await waitFor(() => expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen());
    expect(deckWritesSent()).toEqual([{ name: 'swap_in_planned_swap', request: { planned_swap_id: 'swap' } }]);
    expect(presentedAlert()).toBeNull();
  });

  test('a swap in that fails shows "Check your connection." and the item stays', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    failDeckWrites(1);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Swap in' }));

    await waitFor(() => expect(presentedAlert()).toMatchObject({ title: 'Could not swap in this card', message: 'Check your connection.' }));
    expect(recent.getByRole('button', { name: 'Swap in' })).toBeOnTheScreen();
  });

  test('an item that changed elsewhere reloads instead of acting', async () => {
    ownPlannedSwaps([plannedSwapOf('swap'), plannedSwapOf('other', { incoming: plannedCopyLine('copy-other', 'Counterspell') })]);
    const recent = await openRecent();
    await recent.findByLabelText('+, Lightning Bolt, M10 146');
    changePlannedSwapElsewhere('swap', 'swapped_in');

    await fireEvent.press(recent.getAllByRole('button', { name: 'Swap in' })[0]!);

    await waitFor(() => expect(recent.queryByLabelText('+, Lightning Bolt, M10 146')).not.toBeOnTheScreen());
    expect(recent.getByLabelText('+, Counterspell, M10 146')).toBeOnTheScreen();
    expect(presentedAlert()).toBeNull();
  });

  test('Recent reloads when the tab gains focus', async () => {
    const recent = await openRecent();
    expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen();
    ownPlannedSwaps([plannedSwapOf('swap')]);

    await pressTab('Collection');
    await pressTab('Recent');

    expect(await within(selectedTab()).findByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
  });

  test('the deck tag opens the deck', async () => {
    ownDecks([{ name: 'Krenko', priority: 'medium', card_count: 0 }]);
    ownPlannedSwaps([plannedSwapOf('swap')]);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Krenko' }));

    expect(await within(pushedScreen()).findByRole('header', { name: 'Krenko' })).toBeOnTheScreen();
  });

  test('when the read fails, Recent shows "Could not load Recent", and Try again reads it again', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    failPlannedSwapReads(1);
    const recent = await openRecent();

    expect(await recent.findByText('Could not load Recent')).toBeOnTheScreen();
    await fireEvent.press(recent.getByRole('button', { name: 'Try again' }));

    expect(await recent.findByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
  });
});
