import type { DeckChange, DeckChangeBasicLandLine, DeckChangeCopyLine, DeckChangeKind, RevertPreview } from '@mtgscan/supabase/decks';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { processColor } from 'react-native';

import {
  changeDeckElsewhere,
  deckWritesSent,
  failDeckWrites,
  ownDeckChanges,
  ownDecks,
  ownRevertPreview,
  startSignedIn,
} from './fake-supabase';
import {
  headerButton,
  headerButtonColor,
  headerButtonIsDisabled,
  isPageSheetPresented,
  leftHeaderButtons,
  pressHeaderButton,
  pressTab,
  presentedAlert,
  presentedPageSheet,
  pushedScreen,
  selectedTab,
  symbolTintColor,
  tabHeader,
} from './native-ui';
import { renderApp } from './render-app';
import { tokenColors } from './token-colors';

beforeEach(() => {
  startSignedIn();
});

function copyLine(name: string, places: Pick<DeckChangeCopyLine, 'place_before' | 'place_after'>): DeckChangeCopyLine {
  return {
    kind: 'copy',
    copy_id: `copy-${name}`,
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${name}.jpg`],
    type_line: 'Artifact',
    ...places,
  };
}

function basicLandLine(name: string, counts: Pick<DeckChangeBasicLandLine, 'count_before' | 'count_after'>): DeckChangeBasicLandLine {
  return { kind: 'basic_land', oracle_id: `oracle-${name}`, name, image_uris: [], ...counts };
}

function deckChange(revision: number, kind: DeckChangeKind, lines: DeckChange['lines'] = []): DeckChange {
  return {
    deck_change_id: `deck-change-${revision}`,
    revision,
    kind,
    changed_at: new Date(2026, 9, 15, 9, revision).toISOString(),
    reverted: false,
    lines,
  };
}

const solRingIn = copyLine('Sol Ring', { place_before: 'main', place_after: null });
const history = [
  deckChange(3, 'basic_lands', [basicLandLine('Island', { count_before: 0, count_after: 2 })]),
  deckChange(2, 'removed', [solRingIn]),
  deckChange(1, 'added', [copyLine('Sol Ring', { place_before: null, place_after: 'main' })]),
];
const noEffect: Omit<RevertPreview, 'revision'> = { lines: [], blocks: [], protected_copies: [] };

async function openRevert(revision: number, preview: Partial<Omit<RevertPreview, 'revision'>> = {}, changes = history) {
  ownDecks([{ name: 'Atraxa', priority: 'medium', card_count: 0 }, { name: 'Kinnan', priority: 'low', card_count: 1 }]);
  ownDeckChanges('deck-1', changes.slice(1));
  changeDeckElsewhere('deck-1', changes[0]!);
  ownRevertPreview(`deck-change-${revision}`, { ...noEffect, ...preview });
  await renderApp();
  await pressTab('Decks');
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: /^Atraxa,/ }));
  const deck = within(pushedScreen());
  await fireEvent.press(await deck.findByRole('radio', { name: 'History' }));
  const card = (await deck.findAllByRole('button', { name: 'Revert' }))[history.length - revision]!;
  await fireEvent.press(card);
  return within(presentedPageSheet());
}

function revertWrites() {
  return deckWritesSent().filter((write) => write.name === 'revert_deck_changes');
}

describe('the Revert page sheet', () => {
  test('each deck change on History has a Revert button that opens the Revert page sheet with Cancel, the title, and a lime Revert', async () => {
    const sheet = await openRevert(2);

    expect(await sheet.findByText('Undo "Removed" and the 1 later change in Atraxa as one new change.')).toBeOnTheScreen();
    expect(tabHeader(presentedPageSheet()).title).toBe('Revert');
    expect(leftHeaderButtons(presentedPageSheet())).toEqual(['Cancel']);
    expect(headerButton(presentedPageSheet(), 'Revert')).toMatchObject({ label: 'Revert' });
    expect(headerButtonColor(presentedPageSheet(), 'Revert')).toBe(processColor(tokenColors.primary));
    expect(headerButtonIsDisabled(presentedPageSheet(), 'Revert')).toBe(false);
  });

  test('the undo text counts the later deck changes', async () => {
    expect(await (await openRevert(1)).findByText('Undo "Added" and the 2 later changes in Atraxa as one new change.')).toBeOnTheScreen();
  });

  test('the undo text of the newest deck change names no later change', async () => {
    expect(await (await openRevert(3)).findByText('Undo "Basic lands" as one new change.')).toBeOnTheScreen();
  });

  test('the sheet shows the lines that come back and go out', async () => {
    const sheet = await openRevert(1, {
      lines: [
        copyLine('Cyclonic Rift', { place_before: 'main', place_after: null }),
        copyLine('Sol Ring', { place_before: null, place_after: 'commander' }),
        basicLandLine('Island', { count_before: 2, count_after: 0 }),
      ],
    });

    expect(await sheet.findByLabelText('−, Cyclonic Rift, Artifact')).toBeOnTheScreen();
    expect(sheet.getByLabelText('+, Sol Ring, Commander')).toBeOnTheScreen();
    expect(sheet.getByLabelText('−, Island, −2')).toBeOnTheScreen();
  });

  test('each block shows as a failure notice, and Revert is off', async () => {
    const sheet = await openRevert(1, {
      lines: [copyLine('Sol Ring', { place_before: null, place_after: 'main' })],
      blocks: [
        { copy_id: 'copy-Cyclonic Rift', name: 'Cyclonic Rift', deck: null },
        { copy_id: 'copy-Sol Ring', name: 'Sol Ring', deck: { deck_id: 'deck-2', name: 'Kinnan' } },
      ],
    });

    expect(await sheet.findByRole('alert', { name: 'Cyclonic Rift is no longer in your collection.' })).toBeOnTheScreen();
    expect(sheet.getByRole('alert', { name: 'Sol Ring is in Kinnan.' })).toBeOnTheScreen();
    expect(headerButtonIsDisabled(presentedPageSheet(), 'Revert')).toBe(true);
  });

  test('a protected copy that comes back shows as a warning line, and Revert unprotects it', async () => {
    const sheet = await openRevert(2, {
      lines: [copyLine('Sol Ring', { place_before: null, place_after: 'main' })],
      protected_copies: [{ copy_id: 'copy-Sol Ring', name: 'Sol Ring' }],
    });

    const warning = await sheet.findByLabelText('Sol Ring is protected. Reverting unprotects it.');
    expect(within(warning).getByText('Sol Ring is protected. Reverting unprotects it.')).toHaveStyle({ color: tokenColors.warning });
    expect(symbolTintColor(warning)).toBe(tokenColors.warning);

    await pressHeaderButton(presentedPageSheet(), 'Revert');

    expect(revertWrites()).toEqual([
      { name: 'revert_deck_changes', request: { deck_id: 'deck-1', deck_change_id: 'deck-change-2', expected_revision: 3, unprotect: true } },
    ]);
  });

  test('Revert reverts from the deck change with the revision of the sheet, closes the sheet, and History shows the revert', async () => {
    const sheet = await openRevert(2, { lines: [copyLine('Sol Ring', { place_before: null, place_after: 'main' })] });
    await sheet.findByLabelText('+, Sol Ring, Artifact');

    await pressHeaderButton(presentedPageSheet(), 'Revert');

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(revertWrites()).toEqual([
      { name: 'revert_deck_changes', request: { deck_id: 'deck-1', deck_change_id: 'deck-change-2', expected_revision: 3, unprotect: false } },
    ]);
    const deck = within(pushedScreen());
    await waitFor(() => expect(deck.getAllByText('Revert')).toHaveLength(5));
    expect(deck.getAllByLabelText('Reverted')).toHaveLength(2);
  });

  test('a stale_revision reloads the sheet, and History shows the newer deck change', async () => {
    const sheet = await openRevert(2, { lines: [copyLine('Sol Ring', { place_before: null, place_after: 'main' })] });
    await sheet.findByLabelText('+, Sol Ring, Artifact');
    changeDeckElsewhere('deck-1', deckChange(4, 'added', [copyLine('Cyclonic Rift', { place_before: null, place_after: 'main' })]));
    ownRevertPreview('deck-change-2', {
      ...noEffect,
      lines: [
        copyLine('Cyclonic Rift', { place_before: 'main', place_after: null }),
        copyLine('Sol Ring', { place_before: null, place_after: 'main' }),
      ],
    });

    await pressHeaderButton(presentedPageSheet(), 'Revert');

    expect(await sheet.findByText('Undo "Removed" and the 2 later changes in Atraxa as one new change.')).toBeOnTheScreen();
    expect(sheet.getByLabelText('−, Cyclonic Rift, Artifact')).toBeOnTheScreen();
    expect(isPageSheetPresented()).toBe(true);

    await pressHeaderButton(presentedPageSheet(), 'Cancel');

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(await within(pushedScreen()).findByLabelText('+, Cyclonic Rift, Artifact')).toBeOnTheScreen();
  });

  test('a revert that fails shows an alert, and the sheet stays', async () => {
    await openRevert(3);
    failDeckWrites(1);

    await pressHeaderButton(presentedPageSheet(), 'Revert');

    await waitFor(() => expect(presentedAlert()).toEqual({ title: 'Could not revert this change', message: 'Check your connection.', buttons: ['OK'] }));
    expect(isPageSheetPresented()).toBe(true);
  });

  test('Cancel closes the sheet and reverts nothing', async () => {
    const sheet = await openRevert(3);
    await sheet.findByText('Undo "Basic lands" as one new change.');

    await pressHeaderButton(presentedPageSheet(), 'Cancel');

    await waitFor(() => expect(isPageSheetPresented()).toBe(false));
    expect(revertWrites()).toEqual([]);
    expect(screen.queryByText('Reverted')).not.toBeOnTheScreen();
  });
});
