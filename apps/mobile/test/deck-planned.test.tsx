import { fireEvent, waitFor, within } from 'expo-router/testing-library';

import { leaveTheApp, returnToTheApp } from './app-state';
import { buylistCardOf, freeCopyOf } from './buylist';
import { deckCardOf, openDeckNamed, openDeckWithCards } from './copies';
import {
  buylistQueries,
  changePlannedSwapElsewhere,
  deckWritesSent,
  failDeckWrites,
  failNeedsYouReads,
  ownBuylistCards,
  ownDecks,
  ownFreeCopies,
  ownPlannedSwaps,
  plannedSwapQueries,
  refuseAsThirdCommander,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  isPageSheetPresented,
  presentedAlert,
  presentedPageSheet,
  pressAlertButton,
  pressTab,
  pushedScreen,
  selectedTab,
  tabBadge,
} from './native-ui';
import { plannedCopyLine, plannedSwapOf, reason } from './planned-swaps';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

beforeEach(() => {
  startSignedIn();
});

const krenko = { name: 'Krenko', priority: 'medium' as const, card_count: 0 };

async function openKrenko() {
  ownDecks([krenko, { name: 'Atraxa', priority: 'medium', card_count: 0 }]);
  await renderApp();
  await pressTab('Decks');
  return openDeckNamed('Krenko');
}

async function openPlanned() {
  const deck = await openKrenko();
  await fireEvent.press(deck.getByRole('radio', { name: /^Planned/ }));
  return deck;
}

describe('the Planned tab', () => {
  test('the segmented control is Cards, Planned, and History, and the deck opens on Cards', async () => {
    const deck = await openKrenko();

    const [cards, planned, history] = ['Cards', 'Planned', 'History'].map((name) => deck.getByRole('radio', { name }));
    expect(appearsBefore(cards!, planned!)).toBe(true);
    expect(appearsBefore(planned!, history!)).toBe(true);
    expect(deck.getAllByRole('radio')).toHaveLength(3);
    expect(deck.getByRole('radio', { name: 'Cards', checked: true })).toBeOnTheScreen();
  });

  test("lists the deck's open planned swaps and buylist cards oldest first, without the deck tag", async () => {
    ownPlannedSwaps([
      plannedSwapOf('newer', { incoming: plannedCopyLine('copy-newer', 'Counterspell'), created_at: '2026-10-16T18:05:00.000Z' }),
      plannedSwapOf('elsewhere', { deck_id: 'deck-2', deck_name: 'Atraxa', incoming: plannedCopyLine('copy-elsewhere', 'Fog') }),
    ]);
    ownBuylistCards([buylistCardOf('older', { created_at: '2026-10-15T09:41:00.000Z' })]);

    const deck = await openPlanned();

    const older = await deck.findByLabelText('+, Counterspell, Instant');
    expect(appearsBefore(older, deck.getByLabelText('+, Counterspell, M10 146'))).toBe(true);
    expect(deck.queryByLabelText('+, Fog, M10 146')).not.toBeOnTheScreen();
    expect(deck.getAllByText(reason)).toHaveLength(2);
    expect(deck.getByRole('button', { name: 'Swap in' })).toBeOnTheScreen();
    expect(deck.getByRole('button', { name: 'Bought' })).toBeOnTheScreen();
    expect(deck.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(deck.queryByRole('button', { name: 'Krenko' })).not.toBeOnTheScreen();
    expect(plannedSwapQueries()).toContainEqual({ deck_id: 'deck-1', status: 'open', order: 'oldest_first', limit: 50, cursor: null });
    expect(buylistQueries()).toContainEqual({ deck_id: 'deck-1', status: 'open', order: 'oldest_first', limit: 50, cursor: null });
  });

  test("lists every open planned swap of the deck, past the first page", async () => {
    ownPlannedSwaps(Array.from({ length: 51 }, (_, index) => plannedSwapOf(`swap-${index}`)));

    const deck = await openPlanned();

    await waitFor(() => expect(deck.getAllByRole('button', { name: 'Swap in' })).toHaveLength(51));
    expect(plannedSwapQueries()).toContainEqual({ deck_id: 'deck-1', status: 'open', order: 'oldest_first', limit: 50, cursor: '50' });
  });

  test('with nothing planned, Planned shows its empty state', async () => {
    const deck = await openPlanned();

    expect(
      await deck.findByLabelText('Nothing planned yet, Planned swaps and buylist cards for this deck show up here.'),
    ).toBeOnTheScreen();
  });

  test('when the read fails, Planned says "Could not load this deck", and Try again reads it again', async () => {
    ownDecks([krenko]);
    ownBuylistCards([buylistCardOf('card')]);
    await renderApp();
    await pressTab('Decks');
    failNeedsYouReads(1);
    const deck = await openDeckNamed('Krenko');

    await fireEvent.press(deck.getByRole('radio', { name: /^Planned/ }));
    expect(await deck.findByText('Could not load this deck')).toBeOnTheScreen();
    await fireEvent.press(deck.getByRole('button', { name: 'Try again' }));

    expect(await deck.findByLabelText('+, Counterspell, Instant')).toBeOnTheScreen();
    expect(deck.queryByText('Could not load this deck')).not.toBeOnTheScreen();
  });

  test('Swap in acts at once, and the planned swap leaves Planned', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    const deck = await openPlanned();

    await fireEvent.press(await deck.findByRole('button', { name: 'Swap in' }));

    expect(await deck.findByText('Nothing planned yet')).toBeOnTheScreen();
    expect(deckWritesSent()).toContainEqual({ name: 'swap_in_planned_swap', request: { planned_swap_id: 'swap' } });
  });

  test('Close acts at once, and the buylist card leaves Planned', async () => {
    ownBuylistCards([buylistCardOf('card')]);
    const deck = await openPlanned();

    await fireEvent.press(await deck.findByRole('button', { name: 'Close' }));

    expect(await deck.findByText('Nothing planned yet')).toBeOnTheScreen();
    expect(deckWritesSent()).toContainEqual({ name: 'close_buylist_card', request: { buylist_card_id: 'card' } });
  });

  test('Bought opens the Bought page sheet, and a picked copy leaves Planned', async () => {
    ownBuylistCards([buylistCardOf('card')]);
    ownFreeCopies('oracle-counterspell', [freeCopyOf('copy-alpha')]);
    const deck = await openPlanned();

    await fireEvent.press(await deck.findByRole('button', { name: 'Bought' }));
    await fireEvent.press(await within(presentedPageSheet()).findByRole('button', { name: 'Counterspell, LEA 54' }));

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(await within(pushedScreen()).findByText('Nothing planned yet')).toBeOnTheScreen();
  });
});

describe('landing on a deck tab', () => {
  test('opening a deck from a Recent item lands on Planned', async () => {
    ownDecks([krenko]);
    ownPlannedSwaps([plannedSwapOf('swap')]);
    await renderApp();

    await fireEvent.press(await within(selectedTab()).findByRole('button', { name: 'Krenko' }));

    const deck = within(pushedScreen());
    expect(await deck.findByRole('radio', { name: 'Planned, 1', checked: true })).toBeOnTheScreen();
    expect(await deck.findByLabelText('+, Lightning Bolt, M10 146')).toBeOnTheScreen();
  });

  test('opening a deck from Decks lands on Cards', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);

    const deck = await openKrenko();

    expect(deck.getByRole('radio', { name: 'Cards', checked: true })).toBeOnTheScreen();
  });
});

const tabBarSettleMs = 3000;

describe('Needs you counts', () => {
  test('the Recent tab shows the number of open planned swaps and buylist cards across decks', async () => {
    ownPlannedSwaps([plannedSwapOf('swap'), plannedSwapOf('closed', { status: 'closed' })]);
    ownBuylistCards([buylistCardOf('card', { deck_id: 'deck-2' })]);

    await renderApp();

    await waitFor(() => expect(tabBadge('Recent')).toBe('2'), { timeout: tabBarSettleMs });
    expect(tabBadge('Decks')).toBeUndefined();
  });

  test('the Recent badge shows only once the tab bar has settled after it appears', async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);

    await renderApp();
    await within(selectedTab()).findByRole('button', { name: 'Swap in' });

    expect(tabBadge('Recent')).toBeUndefined();
    await waitFor(() => expect(tabBadge('Recent')).toBe('1'), { timeout: tabBarSettleMs });
  });

  test('the Recent tab has no badge when nothing needs the user', async () => {
    await renderApp();

    await within(selectedTab()).findByText('Nothing needs you yet');
    expect(tabBadge('Recent')).toBeUndefined();
  });

  test('the Recent badge reads the count again when the user returns to the app', async () => {
    await renderApp();
    await within(selectedTab()).findByText('Nothing needs you yet');
    ownBuylistCards([buylistCardOf('card')]);

    await leaveTheApp();
    await returnToTheApp();

    await waitFor(() => expect(tabBadge('Recent')).toBe('1'), { timeout: tabBarSettleMs });
  });

  test('the Recent badge counts down after a Swap in', async () => {
    ownPlannedSwaps([plannedSwapOf('swap'), plannedSwapOf('other', { incoming: plannedCopyLine('copy-other', 'Counterspell') })]);
    await renderApp();
    await waitFor(() => expect(tabBadge('Recent')).toBe('2'), { timeout: tabBarSettleMs });

    await fireEvent.press((await within(selectedTab()).findAllByRole('button', { name: 'Swap in' }))[0]!);

    await waitFor(() => expect(tabBadge('Recent')).toBe('1'));
  });

  test("the Planned tab shows the deck's count in a count badge", async () => {
    ownPlannedSwaps([plannedSwapOf('swap')]);
    ownBuylistCards([buylistCardOf('card'), buylistCardOf('elsewhere', { deck_id: 'deck-2' })]);

    const deck = await openKrenko();

    const planned = await deck.findByRole('radio', { name: 'Planned, 2' });
    expect(within(planned).getByText('2')).toHaveStyle({ color: tokenColors.text });
  });

  test('the Planned tab has no badge when the deck has nothing planned', async () => {
    ownBuylistCards([buylistCardOf('elsewhere', { deck_id: 'deck-2' })]);

    const deck = await openKrenko();

    expect(deck.getByRole('radio', { name: 'Planned' })).toBeOnTheScreen();
  });

  test('the commander gallery card shows the deck count in a count badge', async () => {
    ownDecks([krenko, { name: 'Atraxa', priority: 'medium', card_count: 0 }]);
    ownPlannedSwaps([plannedSwapOf('swap')]);
    ownBuylistCards([buylistCardOf('card')]);
    await renderApp();
    await pressTab('Decks');

    const gallery = within(selectedTab());
    const card = await gallery.findByRole('button', { name: 'Krenko, Needs you 2' });
    expect(within(card).getByText('2')).toBeOnTheScreen();
    expect(gallery.getByRole('button', { name: 'Atraxa' })).toBeOnTheScreen();
  });
});

describe('Planned out', () => {
  test('a deck card that an open planned swap takes out shows "Planned out" on Cards', async () => {
    ownPlannedSwaps([plannedSwapOf('swap', { deck_id: 'deck-1', outgoing: plannedCopyLine('copy-shock', 'Shock') })]);

    const deck = await openDeckWithCards([
      deckCardOf('copy-shock', 'Shock', 'Instant'),
      deckCardOf('copy-bolt', 'Lightning Bolt', 'Instant'),
    ]);

    const shock = await deck.findByRole('button', { name: 'Shock, MH2 262, planned out' });
    expect(within(shock).getByText('Planned out')).toHaveStyle({ color: tokenColors.outgoing });
    expect(deck.getByRole('button', { name: 'Lightning Bolt, MH2 262' })).toBeOnTheScreen();
  });

  test('a buylist card marks nothing on Cards', async () => {
    ownBuylistCards([buylistCardOf('card', { deck_id: 'deck-1', outgoing: plannedCopyLine('copy-shock', 'Shock') })]);

    const deck = await openDeckWithCards([deckCardOf('copy-shock', 'Shock', 'Instant')]);

    expect(await deck.findByRole('button', { name: 'Shock, MH2 262' })).toBeOnTheScreen();
    expect(deck.queryByText('Planned out')).not.toBeOnTheScreen();
  });

  test('a closed planned swap marks nothing on Cards', async () => {
    ownPlannedSwaps([plannedSwapOf('swap', { status: 'closed', outgoing: plannedCopyLine('copy-shock', 'Shock') })]);

    const deck = await openDeckWithCards([deckCardOf('copy-shock', 'Shock', 'Instant')]);

    expect(await deck.findByRole('button', { name: 'Shock, MH2 262' })).toBeOnTheScreen();
    expect(deck.queryByText('Planned out')).not.toBeOnTheScreen();
  });
});

describe('Swap in all', () => {
  const twoSwaps = () => [
    plannedSwapOf('older', { created_at: '2026-10-15T09:41:00.000Z' }),
    plannedSwapOf('newer', { incoming: plannedCopyLine('copy-newer', 'Counterspell'), created_at: '2026-10-16T18:05:00.000Z' }),
  ];

  async function confirmSwapInAll(deck: Awaited<ReturnType<typeof openPlanned>>) {
    await fireEvent.press(await deck.findByRole('button', { name: 'Swap in all' }));
    await pressAlertButton('Swap in all');
  }

  test('shows Swap in all above the list when Planned shows two or more open planned swaps', async () => {
    ownPlannedSwaps(twoSwaps());

    const deck = await openPlanned();

    const button = await deck.findByRole('button', { name: 'Swap in all' });
    expect(appearsBefore(button, deck.getByLabelText('+, Lightning Bolt, M10 146'))).toBe(true);
  });

  test('hides Swap in all with one open planned swap, even with buylist cards', async () => {
    ownPlannedSwaps([plannedSwapOf('swap'), plannedSwapOf('closed', { status: 'closed' }), plannedSwapOf('elsewhere', { deck_id: 'deck-2' })]);
    ownBuylistCards([buylistCardOf('card'), buylistCardOf('other')]);

    const deck = await openPlanned();

    expect(await deck.findByRole('button', { name: 'Swap in' })).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: 'Swap in all' })).not.toBeOnTheScreen();
  });

  test('asks first, and Cancel swaps in nothing', async () => {
    ownPlannedSwaps(twoSwaps());
    const deck = await openPlanned();

    await fireEvent.press(await deck.findByRole('button', { name: 'Swap in all' }));

    expect(presentedAlert()).toEqual({ title: 'Swap in 2 cards?', message: 'Do this after you sleeve them.', buttons: ['Swap in all', 'Cancel'] });
    await pressAlertButton('Cancel');
    expect(deckWritesSent().map(({ name }) => name)).not.toContain('swap_in_planned_swaps');
    expect(deck.getAllByRole('button', { name: 'Swap in' })).toHaveLength(2);
  });

  test('swaps in only the planned swaps that Planned shows, and Planned and its count reload', async () => {
    ownPlannedSwaps([...twoSwaps(), plannedSwapOf('elsewhere', { deck_id: 'deck-2', deck_name: 'Atraxa' })]);
    ownBuylistCards([buylistCardOf('card')]);
    const deck = await openPlanned();
    expect(await deck.findByRole('radio', { name: 'Planned, 3' })).toBeOnTheScreen();

    await confirmSwapInAll(deck);

    expect(deckWritesSent()).toContainEqual({ name: 'swap_in_planned_swaps', request: { deck_id: 'deck-1', planned_swap_ids: ['older', 'newer'] } });
    expect(await deck.findByRole('radio', { name: 'Planned, 1' })).toBeOnTheScreen();
    expect(deck.queryByRole('button', { name: 'Swap in' })).not.toBeOnTheScreen();
    expect(deck.getByRole('button', { name: 'Bought' })).toBeOnTheScreen();
  });

  test('a failed write says "Check your connection.", and the planned swaps stay', async () => {
    ownPlannedSwaps(twoSwaps());
    const deck = await openPlanned();
    failDeckWrites(1);

    await confirmSwapInAll(deck);

    await waitFor(() =>
      expect(presentedAlert()).toEqual({ title: 'Could not swap in all cards', message: 'Check your connection.', buttons: ['OK'] }),
    );
    expect(deck.getAllByRole('button', { name: 'Swap in' })).toHaveLength(2);
  });

  test('a swap in that would make a third commander names the card, and nothing is swapped in', async () => {
    ownPlannedSwaps(twoSwaps());
    refuseAsThirdCommander('newer');
    const deck = await openPlanned();

    await confirmSwapInAll(deck);

    await waitFor(() =>
      expect(presentedAlert()).toEqual({
        title: 'Could not swap in all cards',
        message: 'Counterspell would make a third commander. Nothing was swapped in.',
        buttons: ['OK'],
      }),
    );
    expect(deck.getAllByRole('button', { name: 'Swap in' })).toHaveLength(2);
  });

  test('a planned swap that changed elsewhere reloads Planned', async () => {
    ownPlannedSwaps([...twoSwaps(), plannedSwapOf('third', { incoming: plannedCopyLine('copy-third', 'Fog') })]);
    const deck = await openPlanned();
    expect(await deck.findAllByRole('button', { name: 'Swap in' })).toHaveLength(3);
    changePlannedSwapElsewhere('newer', 'closed');

    await confirmSwapInAll(deck);

    await waitFor(() => expect(deck.getAllByRole('button', { name: 'Swap in' })).toHaveLength(2));
    expect(deck.queryByLabelText('+, Counterspell, M10 146')).not.toBeOnTheScreen();
    expect(presentedAlert()).toBeNull();
  });
});
