import { fireEvent, screen, within } from 'expo-router/testing-library';

import { copyOf, openCollection, openCopyPage } from './copies';
import { changeElsewhere, ownCopies, startSignedIn } from './fake-supabase';
import { fail, requestsSent } from './fake-supabase-controls';
import {
  appearsBefore,
  headerMenuRows,
  pressAlertButton,
  pressHeaderMenuAction,
  presentedAlert,
  pushedScreen,
  selectedTab,
  swipeBackFromThePushedScreen,
  symbolIn,
  symbolNames,
  symbolTintColor,
} from './native-ui';
import { tokenColors } from './token-colors';

const { warning } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

function actionsMenuRows() {
  return headerMenuRows(pushedScreen(), 'More').map((row) => row.title);
}

async function chooseAction(title: string) {
  await pressHeaderMenuAction(pushedScreen(), 'More', [title]);
}

describe('the actions menu', () => {
  test('the actions menu of a free copy offers Protect', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Protect', 'Delete copy']);
  });

  test('the actions menu of a protected copy offers Unprotect', async () => {
    ownCopies([copyOf('copy-1', { protected: true })]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).toEqual(['Unprotect', 'Delete copy']);
  });

  test('the actions menu of a copy that is not free offers no Protect', async () => {
    ownCopies([copyOf('copy-1', { held_for: { deck_id: 'deck-1', name: 'Goblins', commander_art_crop_uri: null } })]);

    await openCopyPage(/^Angelic Curator/);

    expect(actionsMenuRows()).not.toContain('Protect');
  });

  test('Protect protects this copy only, shows the Protected chip, and the menu then offers Unprotect', async () => {
    ownCopies([copyOf('copy-1'), copyOf('copy-2')]);
    await openCollection();
    await fireEvent.press(within(selectedTab()).getAllByRole('button', { name: /^Angelic Curator/ })[1]!);
    await screen.findByRole('header', { name: 'Price' });

    await chooseAction('Protect');

    expect(await screen.findByLabelText('Protected')).toBeOnTheScreen();
    expect(requestsSent('set_copy_protected')).toEqual([{ copy_id: 'copy-2', protected: true }]);
    expect(actionsMenuRows()).toEqual(['Unprotect', 'Delete copy']);
  });

  test('Unprotect unprotects this copy and removes the Protected chip', async () => {
    ownCopies([copyOf('copy-1', { protected: true })]);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Unprotect');

    expect(requestsSent('set_copy_protected')).toEqual([{ copy_id: 'copy-1', protected: false }]);
    await screen.findByLabelText('MH2');
    expect(screen.queryByLabelText('Protected')).not.toBeOnTheScreen();
    expect(actionsMenuRows()).toEqual(['Protect', 'Delete copy']);
  });

  test('after Protect, the binder tile of this copy shows the shield and the other tile does not', async () => {
    ownCopies([copyOf('copy-1', { condition: 'lightly_played' }), copyOf('copy-2')]);
    await openCopyPage('Angelic Curator, MH2 262, lightly played, $0.35');

    await chooseAction('Protect');
    await screen.findByLabelText('Protected');
    await swipeBackFromThePushedScreen();

    const collection = within(selectedTab());
    const protectedTile = await collection.findByRole('button', { name: 'Angelic Curator, MH2 262, lightly played, protected, $0.35' });
    expect(symbolNames(protectedTile)).toEqual(['shield.fill']);
    expect(symbolNames(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, $0.35' }))).toEqual([]);
  });

  test('a copy that no longer exists when the user protects it says so and goes back to the binder', async () => {
    ownCopies([copyOf('copy-1'), copyOf('copy-2', { condition: 'damaged' })]);
    await openCopyPage('Angelic Curator, MH2 262, damaged, $0.35');
    changeElsewhere('delete_copy', { copy_id: 'copy-2', move_planned_swap: true });

    await chooseAction('Protect');

    expect(presentedAlert()).toEqual({ title: 'This card is no longer in your collection.', message: undefined, buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(screen.queryByRole('header', { name: 'Price' })).not.toBeOnTheScreen();
    expect(within(selectedTab()).getAllByRole('button', { name: /^Angelic Curator/ })).toHaveLength(1);
  });

  test('a write that fails says so and leaves the copy as it was', async () => {
    ownCopies([copyOf('copy-1')]);
    fail('set_copy_protected', 1);
    await openCopyPage(/^Angelic Curator/);

    await chooseAction('Protect');

    expect(presentedAlert()).toEqual({ title: 'Could not protect this card', message: 'Check your connection.', buttons: ['OK'] });
    await pressAlertButton('OK');
    expect(screen.queryByLabelText('Protected')).not.toBeOnTheScreen();
    expect(actionsMenuRows()).toEqual(['Protect', 'Delete copy']);
  });
});

describe('the binder tile', () => {
  test('a protected copy has the shield in the warning color, 11 px, before the set icon in its meta line', async () => {
    ownCopies([copyOf('copy-1', { protected: true })]);

    const collection = await openCollection();

    const tile = collection.getByRole('button', { name: 'Angelic Curator, MH2 262, protected, $0.35' });
    expect(symbolNames(tile)).toEqual(['shield.fill']);
    expect(symbolTintColor(tile)).toBe(warning);
    expect(symbolIn(tile).props.size).toBe(11);
    expect(appearsBefore(symbolIn(tile), within(tile).getByLabelText('MH2'))).toBe(true);
  });

  test('VoiceOver hears "protected" after the finish and condition and before the price', async () => {
    ownCopies([copyOf('copy-1', { protected: true, finish: 'foil', condition: 'moderately_played' })]);

    const collection = await openCollection();

    expect(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, foil, moderately played, protected, $0.35' })).toBeOnTheScreen();
  });
});
