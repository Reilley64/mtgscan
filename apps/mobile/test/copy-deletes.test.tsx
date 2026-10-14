import { screen, within } from 'expo-router/testing-library';

import { copyOf, delver, openCopyPage } from './copies';
import {
  copiesDeletedOnTheServer,
  failCopyDeletes,
  ownCollectionTotal,
  ownCopies,
  removeCopyFromTheCollection,
  startSignedIn,
} from './fake-supabase';
import {
  headerMenuRows,
  pressAlertButton,
  pressHeaderMenuAction,
  presentedAlert,
  pushedScreen,
  selectedTab,
  swipeBackFromThePushedScreen,
  tabHeader,
} from './native-ui';

beforeEach(() => {
  startSignedIn();
});

describe('deleting a copy', () => {
  const deleteAlert = {
    title: 'Delete this copy?',
    message: 'It leaves your collection with its user tags. This cannot be undone.',
    buttons: ['Delete copy', 'Cancel'],
  };

  async function chooseDeleteCopy() {
    await pressHeaderMenuAction(pushedScreen(), 'More', ['Delete copy']);
  }

  test('the actions menu ends with Delete copy, destructive', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(headerMenuRows(pushedScreen(), 'More').at(-1)).toEqual({ title: 'Delete copy', destructive: true });
  });

  test('Delete copy asks for a native confirmation before anything is deleted', async () => {
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    await chooseDeleteCopy();

    expect(presentedAlert()).toEqual(deleteAlert);
    expect(copiesDeletedOnTheServer()).toEqual([]);
  });

  test('confirming deletes the copy and goes back to the binder, which no longer shows it', async () => {
    ownCopies([copyOf('copy-1'), delver]);
    await openCopyPage(/^Delver of Secrets/);
    ownCollectionTotal({ total: '0.35', currency: 'USD', priced_copies: 1, copies: 1 });

    await chooseDeleteCopy();
    await pressAlertButton('Delete copy');

    expect(copiesDeletedOnTheServer()).toEqual(['copy-delver']);
    expect(screen.queryByRole('header', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    const collection = selectedTab();
    expect(within(collection).queryByRole('button', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(collection).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
    expect(tabHeader(collection).buttons).toContain('Collection total, $0.35');
  });

  test('Cancel keeps the copy and the copy page', async () => {
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    await chooseDeleteCopy();
    await pressAlertButton('Cancel');

    expect(copiesDeletedOnTheServer()).toEqual([]);
    expect(screen.getByRole('header', { name: 'Angelic Curator' })).toBeOnTheScreen();
    await swipeBackFromThePushedScreen();
    expect(within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('deleting a copy that is no longer in the collection says so and goes back to the binder', async () => {
    ownCopies([copyOf('copy-1'), delver]);
    await openCopyPage(/^Delver of Secrets/);
    removeCopyFromTheCollection('copy-delver');

    await chooseDeleteCopy();
    await pressAlertButton('Delete copy');
    expect(presentedAlert()).toEqual({ title: 'This card is no longer in your collection.', message: undefined, buttons: ['OK'] });
    await pressAlertButton('OK');

    expect(screen.queryByRole('header', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('button', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
  });

  test('a failed delete says so and keeps the copy page', async () => {
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);
    failCopyDeletes(1);

    await chooseDeleteCopy();
    await pressAlertButton('Delete copy');

    expect(presentedAlert()).toEqual({ title: 'Could not delete this copy', message: 'Check your connection.', buttons: ['OK'] });
    expect(copiesDeletedOnTheServer()).toEqual([]);
    expect(screen.getByRole('header', { name: 'Angelic Curator' })).toBeOnTheScreen();
  });
});
