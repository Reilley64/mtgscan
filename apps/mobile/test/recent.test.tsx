import { fireEvent, waitFor, within } from 'expo-router/testing-library';

import { buylistCardOf, freeCopyOf, plannedCardLine } from './buylist';
import {
  buylistQueries,
  changeBuylistCardElsewhere,
  changePlannedSwapElsewhere,
  deckWritesSent,
  failDeckWrites,
  failFreeCopyReads,
  failNeedsYouReads,
  ownBuylistCards,
  ownDecks,
  ownFreeCopies,
  ownPlannedSwaps,
  plannedSwapQueries,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  cardImageUri,
  isPageSheetPresented,
  leftHeaderButtons,
  presentedAlert,
  presentedPageSheet,
  pressTab,
  pushedScreen,
  selectedTab,
  symbolTintColor,
  tabHeader,
} from './native-ui';
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

  test('Close acts at once, sends the planned swap, and the item leaves Recent', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    const recent = await openRecent();
    const close = await recent.findByRole('button', { name: 'Close' });
    expect(close).toHaveStyle({ backgroundColor: tokenColors.surfaceControl });

    await fireEvent.press(close);

    await waitFor(() => expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen());
    expect(deckWritesSent()).toEqual([{ name: 'close_planned_swap', request: { planned_swap_id: 'swap' } }]);
    expect(presentedAlert()).toBeNull();
  });

  test('a close that fails shows "Check your connection." and the item stays', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    failDeckWrites(1);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(presentedAlert()).toMatchObject({ title: 'Could not close this planned swap', message: 'Check your connection.' }),
    );
    expect(recent.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  test('closing an item that changed elsewhere reloads instead of acting', async () => {
    ownPlannedSwaps([plannedSwapOf('swap'), plannedSwapOf('other', { incoming: plannedCopyLine('copy-other', 'Counterspell') })]);
    const recent = await openRecent();
    await recent.findByLabelText('+, Lightning Bolt, M10 146');
    changePlannedSwapElsewhere('swap', 'swapped_in');

    await fireEvent.press(recent.getAllByRole('button', { name: 'Close' })[0]!);

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
    failNeedsYouReads(1);
    const recent = await openRecent();

    expect(await recent.findByText('Could not load Recent')).toBeOnTheScreen();
    await fireEvent.press(recent.getByRole('button', { name: 'Try again' }));

    expect(await recent.findByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
  });
});

describe('Recent buylist cards', () => {
  test('lists open buylist cards beside open planned swaps, oldest first, and asks for open buylist cards only', async () => {
    ownPlannedSwaps([plannedSwapOf('swap', { created_at: '2026-10-15T12:00:00.000Z' })]);
    ownBuylistCards([
      buylistCardOf('newer', { incoming: plannedCardLine('oracle-lotus', 'Black Lotus'), created_at: '2026-10-16T18:05:00.000Z' }),
      buylistCardOf('older', { created_at: '2026-10-15T09:41:00.000Z' }),
    ]);

    const recent = await openRecent();

    const older = await recent.findByLabelText('+, Counterspell, Instant');
    const swap = recent.getByLabelText('+, Lightning Bolt, M10 146');
    expect(appearsBefore(older, swap)).toBe(true);
    expect(appearsBefore(swap, recent.getByLabelText('+, Black Lotus, Instant'))).toBe(true);
    expect(buylistQueries()).toContainEqual({ status: 'open', order: 'oldest_first', limit: 50 });
  });

  test("a buylist card shows its deck tag, the card with its default printing's image, the outgoing copy, its reason, and Bought and Close", async () => {
    ownBuylistCards([
      buylistCardOf('card', {
        as_commander: true,
        incoming: plannedCardLine('oracle-krenko', 'Krenko, Mob Boss', { type_line: 'Legendary Creature — Goblin Warrior' }),
        outgoing: plannedCopyLine('copy-shock', 'Shock', { set: 'm19', collector_number: '156' }),
      }),
    ]);

    const recent = await openRecent();

    const incoming = await recent.findByLabelText('+, Krenko, Mob Boss, Legendary Creature — Goblin Warrior · Commander');
    expect(cardImageUri(incoming)).toBe('https://cards.scryfall.io/normal/front/oracle-krenko.jpg');
    expect(recent.getByLabelText('−, Shock, M19 156')).toBeOnTheScreen();
    expect(recent.getByRole('button', { name: 'Krenko' })).toBeOnTheScreen();
    expect(recent.getByText(reason)).toBeOnTheScreen();
    expect(recent.getByText('ChatGPT · 16 October 2026 at 18:05')).toBeOnTheScreen();
    expect(recent.getByRole('button', { name: 'Bought' })).toHaveStyle({ backgroundColor: tokenColors.primary });
    expect(recent.getByRole('button', { name: 'Close' })).toHaveStyle({ backgroundColor: tokenColors.surfaceControl });
    expect(recent.queryByRole('button', { name: 'Swap in' })).not.toBeOnTheScreen();
  });

  test('a buylist card that would break a Commander rule shows the effect chip', async () => {
    ownBuylistCards([buylistCardOf('card', { effect: { kind: 'adds_violation', rules: [{ rule: 'singleton' }] } })]);

    const recent = await openRecent();

    expect(await recent.findByLabelText('Adds a violation to Krenko: singleton')).toBeOnTheScreen();
  });

  test('the All, Planned swaps, and Buylist chips show one kind at a time', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    ownBuylistCards([buylistCardOf('card')]);
    const recent = await openRecent();
    await recent.findByLabelText('+, Counterspell, Instant');
    expect(recent.getByRole('button', { name: 'All' })).toBeSelected();

    await fireEvent.press(recent.getByRole('button', { name: 'Buylist' }));

    expect(recent.getByLabelText('+, Counterspell, Instant')).toBeOnTheScreen();
    expect(recent.queryByLabelText('+, Lightning Bolt, M10 146')).not.toBeOnTheScreen();

    await fireEvent.press(recent.getByRole('button', { name: 'Planned swaps' }));

    expect(recent.getByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
    expect(recent.queryByLabelText('+, Counterspell, Instant')).not.toBeOnTheScreen();

    await fireEvent.press(recent.getByRole('button', { name: 'All' }));

    expect(recent.getByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
    expect(recent.getByLabelText('+, Counterspell, Instant')).toBeOnTheScreen();
  });

  test('the chips hide while Recent is empty', async () => {
    const recent = await openRecent();

    expect(await recent.findByText('Nothing needs you yet')).toBeOnTheScreen();
    expect(recent.queryByRole('button', { name: 'All' })).not.toBeOnTheScreen();
    expect(recent.queryByRole('button', { name: 'Buylist' })).not.toBeOnTheScreen();
  });

  test('Close acts at once, sends the buylist card, and the item leaves Recent', async () => {
    ownBuylistCards([buylistCardOf('card')]);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Close' }));

    await waitFor(() => expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen());
    expect(deckWritesSent()).toEqual([{ name: 'close_buylist_card', request: { buylist_card_id: 'card' } }]);
    expect(presentedAlert()).toBeNull();
  });

  test('a close that fails shows "Check your connection." and the item stays', async () => {
    ownBuylistCards([buylistCardOf('card')]);
    failDeckWrites(1);
    const recent = await openRecent();

    await fireEvent.press(await recent.findByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(presentedAlert()).toMatchObject({ title: 'Could not close this buylist card', message: 'Check your connection.' }),
    );
    expect(recent.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  test('closing a buylist card that changed elsewhere reloads instead of acting', async () => {
    ownBuylistCards([buylistCardOf('card'), buylistCardOf('other', { incoming: plannedCardLine('oracle-lotus', 'Black Lotus') })]);
    const recent = await openRecent();
    await recent.findByLabelText('+, Counterspell, Instant');
    changeBuylistCardElsewhere('card', 'closed');

    await fireEvent.press(recent.getAllByRole('button', { name: 'Close' })[0]!);

    await waitFor(() => expect(recent.queryByLabelText('+, Counterspell, Instant')).not.toBeOnTheScreen());
    expect(recent.getByLabelText('+, Black Lotus, Instant')).toBeOnTheScreen();
  });
});

describe('the Bought page sheet', () => {
  async function openBought(copies = [freeCopyOf('copy-alpha')]) {
    ownDecks([{ name: 'Krenko', priority: 'medium', card_count: 1 }]);
    ownBuylistCards([buylistCardOf('card')]);
    ownFreeCopies('oracle-counterspell', copies);
    const recent = await openRecent();
    await fireEvent.press(await recent.findByRole('button', { name: 'Bought' }));
    return within(presentedPageSheet());
  }

  test('Bought opens a page sheet with Cancel and the title, listing the free copies of the card across printings', async () => {
    const sheet = await openBought([
      freeCopyOf('copy-alpha'),
      freeCopyOf('copy-foil', { set: 'ss1', collector_number: '4', finish: 'foil', condition: 'lightly_played' }),
    ]);

    const alpha = await sheet.findByRole('button', { name: 'Counterspell, LEA 54' });
    expect(cardImageUri(alpha)).toBe('https://cards.scryfall.io/normal/front/copy-alpha.jpg');
    expect(sheet.getByRole('button', { name: 'Counterspell, SS1 4 · Foil · LP' })).toBeOnTheScreen();
    expect(tabHeader(presentedPageSheet()).title).toBe('Bought');
    expect(leftHeaderButtons(presentedPageSheet())).toEqual(['Cancel']);
  });

  test('picking a copy marks the buylist card bought with that copy, closes the sheet, and the item leaves Recent', async () => {
    const sheet = await openBought();

    await fireEvent.press(await sheet.findByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(deckWritesSent()).toEqual([
      { name: 'mark_buylist_card_bought', request: { buylist_card_id: 'card', copy_id: 'copy-alpha', unprotect: false } },
    ]);
    expect(await within(selectedTab()).findByText('Nothing needs you yet')).toBeOnTheScreen();
  });

  test('a protected copy shows a warning line and is unprotected when picked', async () => {
    const sheet = await openBought([freeCopyOf('copy-kept', { protected: true })]);

    const warning = await sheet.findByLabelText('Counterspell is protected. Picking it unprotects it.');
    expect(symbolTintColor(warning)).toBe(tokenColors.warning);
    await fireEvent.press(sheet.getByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(deckWritesSent()).toEqual([
      { name: 'mark_buylist_card_bought', request: { buylist_card_id: 'card', copy_id: 'copy-kept', unprotect: true } },
    ]);
  });

  test('with no free copy, it says "No copies found. Scan copies into your collection first."', async () => {
    const sheet = await openBought([]);

    expect(await sheet.findByLabelText('No copies found, Scan copies into your collection first.')).toBeOnTheScreen();
  });

  test('a Bought that fails shows "Check your connection." and the sheet stays', async () => {
    const sheet = await openBought();
    failDeckWrites(1);

    await fireEvent.press(await sheet.findByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() =>
      expect(presentedAlert()).toMatchObject({ title: 'Could not mark this card bought', message: 'Check your connection.' }),
    );
    expect(isPageSheetPresented()).toBe(true);
  });

  test('a buylist card that changed elsewhere closes the sheet and Recent reloads', async () => {
    const sheet = await openBought();
    changeBuylistCardElsewhere('card', 'closed');

    await fireEvent.press(await sheet.findByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(await within(selectedTab()).findByText('Nothing needs you yet')).toBeOnTheScreen();
    expect(presentedAlert()).toBeNull();
  });

  test('a copy that is no longer free reloads the sheet', async () => {
    const sheet = await openBought([freeCopyOf('copy-alpha'), freeCopyOf('copy-beta', { set: 'fdc', collector_number: '61' })]);
    await sheet.findByRole('button', { name: 'Counterspell, LEA 54' });
    ownFreeCopies('oracle-counterspell', [freeCopyOf('copy-beta', { set: 'fdc', collector_number: '61' })]);

    await fireEvent.press(sheet.getByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() => expect(sheet.queryByRole('button', { name: 'Counterspell, LEA 54' })).not.toBeOnTheScreen());
    expect(sheet.getByRole('button', { name: 'Counterspell, FDC 61' })).toBeOnTheScreen();
    expect(isPageSheetPresented()).toBe(true);
  });

  test('when the free copies cannot load, the sheet says "Could not load your copies", and Try again reads them again', async () => {
    failFreeCopyReads(1);
    const sheet = await openBought();

    expect(await sheet.findByText('Could not load your copies')).toBeOnTheScreen();
    await fireEvent.press(sheet.getByRole('button', { name: 'Try again' }));

    expect(await sheet.findByRole('button', { name: 'Counterspell, LEA 54' })).toBeOnTheScreen();
  });
});
