import type { CopyDetails } from '@mtgscan/supabase/collection';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { copyOf, delver, openCollection, openCopyPage } from './copies';
import {
  answerCollectionSearches,
  failCopyReads,
  failUserTagChanges,
  failUserTagReads,
  ownCopies,
  ownUserTags,
  removeCopyFromTheCollection,
  startSignedIn,
} from './fake-supabase';
import {
  appearsBefore,
  blurredImageUris,
  buttonMenuActions,
  cardImageUri,
  cardSheen,
  menuButton,
  menuButtonNames,
  pressAlertButton,
  pressButtonMenuAction,
  presentedAlert,
  pressTab,
  pushedScreen,
  pushedScreenBackButton,
  selectedTab,
  swipeBackFromThePushedScreen,
  symbolNames,
  symbolTintColor,
  typeInSearchBar,
} from './native-ui';
import { tokenColors } from './token-colors';

const { warning, textPrice } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

describe('the binder tile', () => {
  test('a binder tile is a button that names the card, its printing, its finish and condition, and its price', async () => {
    ownCopies([copyOf('copy-1', { finish: 'foil', condition: 'moderately_played', price: { amount: '1635.37', currency: 'USD', finish: 'foil', stale: false } })]);

    const collection = await openCollection();

    expect(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, foil, moderately played, $1,635.37' })).toBeOnTheScreen();
  });

  test('a binder tile opens the copy page for that copy, pushed over the tab bar', async () => {
    ownCopies([copyOf('copy-1'), delver]);

    await openCopyPage(/^Delver of Secrets/);

    const title = screen.getByRole('header', { name: 'Delver of Secrets // Insectile Aberration' });
    expect(title).toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('header', { name: 'Delver of Secrets // Insectile Aberration' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Angelic Curator' })).not.toBeOnTheScreen();
  });

  test('a binder tile in search results opens the copy page for that copy', async () => {
    const curator = copyOf('copy-1');
    ownCopies([curator, delver]);
    answerCollectionSearches((query) => (query.text === 'delver' ? [delver] : [curator, delver]));
    const collection = await openCollection();

    await typeInSearchBar('delver');
    await fireEvent.press(collection.getByRole('button', { name: /^Delver of Secrets/ }));

    expect(await screen.findByRole('header', { name: 'Delver of Secrets // Insectile Aberration' })).toBeOnTheScreen();
  });
});

describe('the copy page', () => {
  test('the copy page shows the card large over its blurred art, then its name and type line', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    const hero = screen.getByRole('image', { name: 'Angelic Curator' });
    expect(cardImageUri(hero)).toBe('https://cards.scryfall.io/normal/front/curator.jpg');
    expect(cardSheen(hero)).toBeNull();
    expect(blurredImageUris()).toEqual(['https://cards.scryfall.io/normal/front/curator.jpg']);
    const title = screen.getByRole('header', { name: 'Angelic Curator' });
    expect(appearsBefore(hero, title)).toBe(true);
    expect(appearsBefore(title, screen.getByText('Creature — Angel Spirit'))).toBe(true);
  });

  test.each(['foil', 'etched'] as const)('%s copies keep their sheen on the copy page', async (finish) => {
    ownCopies([copyOf('copy-1', { finish })]);

    await openCopyPage(/^Angelic Curator/);

    expect(cardSheen(screen.getByRole('image', { name: 'Angelic Curator' }))).toMatchObject({ opacity: expect.closeTo(0.3) });
  });

  test('chips show the set code, the collector number, the condition, and the language of a nonfoil copy', async () => {
    ownCopies([copyOf('copy-1', { condition: 'lightly_played', language: 'ja' })]);

    await openCopyPage(/^Angelic Curator/);

    for (const chip of ['MH2', '262', 'LP', 'Japanese']) {
      expect(screen.getByLabelText(chip)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('Nonfoil')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Protected')).not.toBeOnTheScreen();
  });

  test('a foil copy has a Foil chip, and a protected copy has a Protected chip with the shield in the warning color', async () => {
    ownCopies([copyOf('copy-1', { finish: 'foil', protected: true })]);

    await openCopyPage(/^Angelic Curator/);

    const protectedChip = screen.getByLabelText('Protected');
    expect(within(protectedChip).getByText('Protected')).toHaveStyle({ color: warning });
    expect(symbolNames(protectedChip)).toEqual(['shield.fill']);
    expect(symbolTintColor(protectedChip)).toBe(warning);
    expect(appearsBefore(protectedChip, screen.getByLabelText('MH2'))).toBe(true);
    expect(screen.getByLabelText('Foil')).toBeOnTheScreen();
    expect(screen.getByLabelText('NM')).toBeOnTheScreen();
  });

  test('Price shows the current price, the day the copy was added, the purchase-day price, and the price credit', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    const heading = screen.getByRole('header', { name: 'Price' });
    const current = screen.getByLabelText('Current price, $0.35');
    expect(within(current).getByText('$0.35')).toHaveStyle({ color: textPrice });
    expect(symbolNames(current)).toEqual([]);
    expect(current).not.toHaveProp('accessibilityHint');
    const added = screen.getByLabelText('Added, 12 October 2026');
    const purchaseDay = screen.getByLabelText('Purchase-day price, $0.21');
    const credit = screen.getByText('Current prices from Scryfall, in USD');
    expect(appearsBefore(heading, current)).toBe(true);
    expect(appearsBefore(current, added)).toBe(true);
    expect(appearsBefore(added, purchaseDay)).toBe(true);
    expect(appearsBefore(purchaseDay, credit)).toBe(true);
  });

  test('a stale current price has the clock, and VoiceOver hears that it may be out of date', async () => {
    ownCopies([copyOf('copy-1', { price: { amount: '0.35', currency: 'USD', finish: 'nonfoil', stale: true } })]);

    await openCopyPage(/^Angelic Curator/);

    const current = screen.getByLabelText('Current price, $0.35');
    expect(symbolNames(current)).toEqual(['clock']);
    expect(current).toHaveProp('accessibilityHint', 'The price may be out of date.');
  });

  test('a copy with no prices shows dashes, and VoiceOver says no price', async () => {
    ownCopies([copyOf('copy-1', { price: null, purchase_day_price: null })]);

    await openCopyPage(/^Angelic Curator/);

    expect(within(screen.getByLabelText('Current price, no price')).getByText('–')).toBeOnTheScreen();
    expect(within(screen.getByLabelText('Purchase-day price, no price')).getByText('–')).toBeOnTheScreen();
  });

  test('Rules shows the Oracle text of each face and Commander legality', async () => {
    ownCopies([delver]);

    await openCopyPage(/^Delver of Secrets/);

    const heading = screen.getByRole('header', { name: 'Rules' });
    const front = screen.getByText('At the beginning of your upkeep, look at the top card of your library.');
    const back = screen.getByText('Flying');
    expect(appearsBefore(heading, screen.getByText('Delver of Secrets'))).toBe(true);
    expect(appearsBefore(screen.getByText('Delver of Secrets'), front)).toBe(true);
    expect(appearsBefore(front, screen.getByText('Insectile Aberration'))).toBe(true);
    expect(appearsBefore(screen.getByText('Insectile Aberration'), back)).toBe(true);
    expect(appearsBefore(back, screen.getByLabelText('Commander, Legal'))).toBe(true);
  });

  test('a card with one face shows its Oracle text without the face name', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.getByText('Flying, protection from artifacts')).toBeOnTheScreen();
    expect(screen.getAllByText('Angelic Curator')).toHaveLength(1);
  });

  test.each([
    ['banned', 'Banned'],
    ['not_legal', 'Not legal'],
  ] as const)('a card that is %s in Commander says so', async (commander_legality, shown) => {
    ownCopies([copyOf('copy-1', { commander_legality })]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.getByLabelText(`Commander, ${shown}`)).toBeOnTheScreen();
  });

  test('the copy page shows only this copy, with no other copies or printings', async () => {
    ownCopies([
      copyOf('copy-1', { condition: 'moderately_played' }),
      copyOf('copy-2', { condition: 'lightly_played' }),
      copyOf('copy-3', { printing_id: 'printing-curator-promo', set: 'pmh2', collector_number: '262p' }),
    ]);

    await openCopyPage('Angelic Curator, MH2 262, lightly played, $0.35');

    expect(screen.getAllByRole('image', { name: 'Angelic Curator' })).toHaveLength(1);
    expect(screen.getByLabelText('LP')).toBeOnTheScreen();
    expect(screen.queryByLabelText('MP')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('PMH2')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Angelic Curator,/ })).not.toBeOnTheScreen();
  });

  test('the copy page has no on-screen back button and goes back to the binder with the edge swipe', async () => {
    ownCopies([copyOf('copy-1')]);
    await openCopyPage(/^Angelic Curator/);

    expect(pushedScreenBackButton()).toBeNull();
    await swipeBackFromThePushedScreen();

    expect(screen.queryByRole('header', { name: 'Angelic Curator' })).not.toBeOnTheScreen();
    expect(within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('a copy that no longer exists says so and goes back to the binder, which no longer shows it', async () => {
    ownCopies([copyOf('copy-1'), delver]);
    const collection = await openCollection();
    removeCopyFromTheCollection('copy-delver');

    await fireEvent.press(collection.getByRole('button', { name: /^Delver of Secrets/ }));
    expect(presentedAlert()).toEqual({ title: 'This card is no longer in your collection.', message: undefined, buttons: ['OK'] });
    await pressAlertButton('OK');

    expect(presentedAlert()).toBeNull();
    expect(screen.queryByRole('header', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(selectedTab()).queryByRole('button', { name: /^Delver of Secrets/ })).not.toBeOnTheScreen();
    expect(within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ })).toBeOnTheScreen();
  });

  test('a failed copy read offers Try again, which shows the copy', async () => {
    ownCopies([copyOf('copy-1')]);
    failCopyReads(1);
    const collection = await openCollection();

    await fireEvent.press(collection.getByRole('button', { name: /^Angelic Curator/ }));
    expect(await screen.findByText('Could not load this card')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'Angelic Curator' })).toBeOnTheScreen();
    expect(screen.queryByText('Could not load this card')).not.toBeOnTheScreen();
  });
});

describe('user tags on the copy page', () => {
  test("the copy page has a User tags heading and one row with the copy's user tags as chips, read as a button", async () => {
    ownCopies([copyOf('copy-1')]);
    ownUserTags([
      { name: 'trade binder', copyIds: ['copy-1'] },
      { name: 'signed', copyIds: ['copy-1'] },
      { name: 'Foil binder', copyIds: [] },
    ]);

    await openCopyPage(/^Angelic Curator/);

    const heading = screen.getByRole('header', { name: 'User tags' });
    const row = screen.getByRole('button', { name: 'User tags, signed, trade binder' });
    expect(within(row).getByLabelText('signed')).toBeOnTheScreen();
    expect(within(row).getByLabelText('trade binder')).toBeOnTheScreen();
    expect(within(row).queryByLabelText('Foil binder')).not.toBeOnTheScreen();
    expect(symbolNames(row)).toEqual(['chevron.right']);
    expect(appearsBefore(screen.getByLabelText('English'), heading)).toBe(true);
    expect(appearsBefore(heading, row)).toBe(true);
    expect(appearsBefore(row, screen.getByRole('header', { name: 'Price' }))).toBe(true);
  });

  test('a copy with no user tags has an Add user tags row', async () => {
    ownCopies([copyOf('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    const row = screen.getByRole('button', { name: 'Add user tags' });
    expect(within(row).getByText('Add user tags')).toBeOnTheScreen();
    expect(symbolNames(row)).toEqual(['chevron.right']);
  });

  test('binder tiles still show no user tags', async () => {
    ownCopies([copyOf('copy-1')]);
    ownUserTags([{ name: 'signed', copyIds: ['copy-1'] }]);

    const collection = await openCollection();

    expect(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, $0.35' })).toBeOnTheScreen();
    expect(collection.queryByText('signed')).not.toBeOnTheScreen();
  });
});

describe('the user tag picker', () => {
  async function openUserTagPicker(copy: CopyDetails = copyOf('copy-1')) {
    ownCopies([copy]);
    await openCopyPage(/^Angelic Curator/);
    await fireEvent.press(screen.getByRole('button', { name: /^(User tags,|Add user tags)/ }));
    return screen.findByLabelText('Find or create a user tag');
  }

  test('the User tags row pushes the user tag picker, titled User tags, with a line that names the copy', async () => {
    const field = await openUserTagPicker(copyOf('copy-1', { finish: 'foil', condition: 'lightly_played' }));

    const title = screen.getAllByRole('header', { name: 'User tags' }).at(-1)!;
    const copyLine = screen.getByText('Angelic Curator · MH2 · 262 · Foil · LP · English');
    expect(appearsBefore(title, copyLine)).toBe(true);
    expect(appearsBefore(copyLine, field)).toBe(true);
    expect(field).toHaveProp('placeholder', 'Find or create a user tag');
    expect(field).toHaveProp('maxLength', 64);
  });

  test('the user tag picker has no on-screen back button and goes back to the copy page with the edge swipe', async () => {
    await openUserTagPicker();

    expect(pushedScreenBackButton()).toBeNull();
    await swipeBackFromThePushedScreen();

    expect(screen.queryByLabelText('Find or create a user tag')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add user tags' })).toBeOnTheScreen();
  });

  test('rows list the user tags that match the typed text ignoring case, with a check when this copy has it and the copy count', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1', 'copy-2', 'copy-3'] },
      { name: 'trade binder', copyIds: ['copy-2'] },
      { name: 'misprint', copyIds: [] },
    ]);
    const field = await openUserTagPicker();

    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual([
      'misprint, 0 copies',
      'Signed, 1 copy',
      'trade binder, 0 copies',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Signed, 1 copy' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'trade binder, 0 copies' })).not.toBeChecked();

    await fireEvent.changeText(field, 'IN');

    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual([
      'misprint, 0 copies',
      'trade binder, 0 copies',
    ]);
    await fireEvent.changeText(field, 'SIG');
    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual(['Signed, 1 copy']);
  });

  test('tapping a row adds the user tag to this copy, tapping it again takes it off, and the copy page shows the result', async () => {
    ownUserTags([
      { name: 'signed', copyIds: [] },
      { name: 'trade binder', copyIds: [] },
    ]);
    await openUserTagPicker();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'signed, 0 copies' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'trade binder, 0 copies' }));
    expect(await screen.findByRole('checkbox', { name: 'trade binder, 1 copy' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'trade binder, 1 copy' }));

    expect(await screen.findByRole('checkbox', { name: 'trade binder, 0 copies' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'signed, 1 copy' })).toBeChecked();
    await swipeBackFromThePushedScreen();
    expect(await screen.findByRole('button', { name: 'User tags, signed' })).toBeOnTheScreen();
  });

  test('a name that matches no user tag ignoring case offers to create it, which adds it to this copy', async () => {
    ownUserTags([{ name: 'Signed', copyIds: [] }]);
    const field = await openUserTagPicker();

    await fireEvent.changeText(field, 'signed ');
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeOnTheScreen();
    await fireEvent.changeText(field, '  Trade binder ');
    const create = screen.getByRole('button', { name: 'Create "Trade binder", and add it to this copy' });
    expect(symbolNames(create)).toEqual(['plus']);
    await fireEvent.press(create);

    expect(await screen.findByRole('checkbox', { name: 'Trade binder, 1 copy' })).toBeChecked();
    expect(field).toHaveProp('value', '');
    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual([
      'Signed, 0 copies',
      'Trade binder, 1 copy',
    ]);
    await swipeBackFromThePushedScreen();
    expect(await screen.findByRole('button', { name: 'User tags, Trade binder' })).toBeOnTheScreen();
  });

  test('the Create row comes first, before the user tags that contain the text', async () => {
    ownUserTags([{ name: 'Signed', copyIds: [] }]);
    const field = await openUserTagPicker();

    await fireEvent.changeText(field, 'Sign');

    expect(appearsBefore(screen.getByRole('button', { name: /^Create "Sign"/ }), screen.getByRole('checkbox', { name: 'Signed, 0 copies' }))).toBe(true);
  });

  test('with no user tags the picker says how to create one', async () => {
    const field = await openUserTagPicker();

    expect(screen.getByText('No user tags yet. Type a name to create one.')).toBeOnTheScreen();
    await fireEvent.changeText(field, 'Signed');

    expect(screen.queryByText('No user tags yet. Type a name to create one.')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create "Signed", and add it to this copy' })).toBeOnTheScreen();
  });

  test('a copy that no longer exists goes back to the copy page, which says so', async () => {
    ownUserTags([{ name: 'signed', copyIds: [] }]);
    await openUserTagPicker();
    removeCopyFromTheCollection('copy-1');

    await fireEvent.press(screen.getByRole('checkbox', { name: 'signed, 0 copies' }));

    expect(presentedAlert()).toEqual({ title: 'This card is no longer in your collection.', message: undefined, buttons: ['OK'] });
    expect(screen.queryByLabelText('Find or create a user tag')).not.toBeOnTheScreen();
  });

  test('a failed read offers Try again, which shows the user tags', async () => {
    ownUserTags([{ name: 'signed', copyIds: [] }]);
    ownCopies([copyOf('copy-1')]);
    failUserTagReads(1);
    await openCopyPage(/^Angelic Curator/);
    await fireEvent.press(screen.getByRole('button', { name: 'Add user tags' }));

    expect(await screen.findByText('Could not load your user tags')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'signed, 0 copies' })).toBeOnTheScreen();
    expect(screen.queryByText('Could not load your user tags')).not.toBeOnTheScreen();
  });

  test('a change that fails says so and leaves the copy as it was', async () => {
    ownUserTags([{ name: 'signed', copyIds: [] }]);
    failUserTagChanges(1);
    await openUserTagPicker();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'signed, 0 copies' }));

    expect(await screen.findByRole('alert', { name: 'Could not change the user tags. Check your connection.' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'signed, 0 copies' })).not.toBeChecked();
  });
});

describe('renaming and deleting a user tag', () => {
  async function openUserTagPicker() {
    ownCopies([copyOf('copy-1'), { ...delver, copy_id: 'copy-2' }, { ...delver, copy_id: 'copy-3' }]);
    await openCopyPage(/^Angelic Curator/);
    await fireEvent.press(screen.getByRole('button', { name: /^(User tags,|Add user tags)/ }));
    return screen.findByLabelText('Find or create a user tag');
  }

  test('each row has a native menu with Rename and Delete user tag', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1'] },
      { name: 'trade binder', copyIds: [] },
    ]);
    await openUserTagPicker();

    expect(menuButtonNames(pushedScreen())).toEqual(['More, Signed', 'More, trade binder']);
    expect(buttonMenuActions(menuButton(screen.container, 'More, Signed'))).toEqual([
      { title: 'Rename', destructive: false },
      { title: 'Delete user tag', destructive: true },
    ]);
  });

  test('Rename edits the name in the row, Save keeps the user tag on its copies, and the copy page shows the new name', async () => {
    ownUserTags([{ name: 'Signd', copyIds: ['copy-1', 'copy-2'] }]);
    await openUserTagPicker();

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signd'), 'Rename');
    const field = screen.getByLabelText('User tag name');
    expect(field).toHaveProp('value', 'Signd');
    expect(field).toHaveProp('maxLength', 64);
    expect(screen.queryByRole('checkbox', { name: 'Signd, 2 copies' })).not.toBeOnTheScreen();
    await fireEvent.changeText(field, ' Signed ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('checkbox', { name: 'Signed, 2 copies' })).toBeChecked();
    expect(screen.queryByLabelText('User tag name')).not.toBeOnTheScreen();
    await swipeBackFromThePushedScreen();
    expect(await screen.findByRole('button', { name: 'User tags, Signed' })).toBeOnTheScreen();
  });

  test('Save is off while the name is empty', async () => {
    ownUserTags([{ name: 'Signed', copyIds: [] }]);
    await openUserTagPicker();

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Rename');
    await fireEvent.changeText(screen.getByLabelText('User tag name'), '   ');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('a name that matches another user tag ignoring case is refused, and the name stays in the row to change', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1'] },
      { name: 'trade binder', copyIds: [] },
    ]);
    await openUserTagPicker();

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Rename');
    await fireEvent.changeText(screen.getByLabelText('User tag name'), 'Trade Binder');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert', { name: 'You already have a user tag named "Trade Binder".' })).toBeOnTheScreen();
    expect(screen.getByLabelText('User tag name')).toHaveProp('value', 'Trade Binder');
    expect(screen.getByRole('checkbox', { name: 'trade binder, 0 copies' })).toBeOnTheScreen();
  });

  test('Delete user tag asks under the row how many copies it comes off, and Cancel keeps it', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1', 'copy-2', 'copy-3'] },
      { name: 'trade binder', copyIds: ['copy-2'] },
    ]);
    await openUserTagPicker();

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Delete user tag');
    const question = screen.getByText('Delete "Signed"? It comes off 3 copies.');
    expect(appearsBefore(screen.getByRole('checkbox', { name: 'Signed, 3 copies' }), question)).toBe(true);
    expect(appearsBefore(question, screen.getByRole('checkbox', { name: 'trade binder, 1 copy' }))).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/^Delete "Signed"\?/)).not.toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Signed, 3 copies' })).toBeChecked();
    await pressButtonMenuAction(menuButton(screen.container, 'More, trade binder'), 'Delete user tag');
    expect(screen.getByText('Delete "trade binder"? It comes off 1 copy.')).toBeOnTheScreen();
  });

  test('Delete user tag takes it off every copy, and the copy page shows the result', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1', 'copy-2'] },
      { name: 'trade binder', copyIds: ['copy-1'] },
    ]);
    await openUserTagPicker();

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Delete user tag');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete user tag' }));

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /^Signed,/ })).not.toBeOnTheScreen());
    expect(screen.queryByText(/^Delete "Signed"\?/)).not.toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'trade binder, 1 copy' })).toBeChecked();
    await swipeBackFromThePushedScreen();
    expect(await screen.findByRole('button', { name: 'User tags, trade binder' })).toBeOnTheScreen();
  });

  test('a user tag deleted on another phone leaves the picker when the user renames it, with no failure', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1'] },
      { name: 'trade binder', copyIds: [] },
    ]);
    await openUserTagPicker();
    ownUserTags([{ name: 'Signed', copyIds: ['copy-1'] }]);

    await pressButtonMenuAction(menuButton(screen.container, 'More, trade binder'), 'Rename');
    await fireEvent.changeText(screen.getByLabelText('User tag name'), 'Trade');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('User tag name')).not.toBeOnTheScreen());
    expect(screen.queryByRole('checkbox', { name: /^(trade binder|Trade),/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  test('a rename that fails says so and keeps the new name in the row to try again', async () => {
    ownUserTags([{ name: 'Signed', copyIds: ['copy-1'] }]);
    await openUserTagPicker();
    failUserTagChanges(1);

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Rename');
    await fireEvent.changeText(screen.getByLabelText('User tag name'), 'Autographed');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert', { name: 'Could not change the user tags. Check your connection.' })).toBeOnTheScreen();
    expect(screen.getByLabelText('User tag name')).toHaveProp('value', 'Autographed');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('checkbox', { name: 'Autographed, 1 copy' })).toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  test('a delete that fails says so and keeps the user tag and its confirmation', async () => {
    ownUserTags([{ name: 'Signed', copyIds: ['copy-1'] }]);
    await openUserTagPicker();
    failUserTagChanges(1);

    await pressButtonMenuAction(menuButton(screen.container, 'More, Signed'), 'Delete user tag');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete user tag' }));

    expect(await screen.findByRole('alert', { name: 'Could not change the user tags. Check your connection.' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Signed, 1 copy' })).toBeChecked();
    expect(screen.getByText('Delete "Signed"? It comes off 1 copy.')).toBeOnTheScreen();
  });

  test('a user tag deleted on another phone leaves the picker when the user deletes it, with no failure', async () => {
    ownUserTags([
      { name: 'Signed', copyIds: ['copy-1'] },
      { name: 'trade binder', copyIds: [] },
    ]);
    await openUserTagPicker();
    ownUserTags([{ name: 'Signed', copyIds: ['copy-1'] }]);

    await pressButtonMenuAction(menuButton(screen.container, 'More, trade binder'), 'Delete user tag');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete user tag' }));

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /^trade binder,/ })).not.toBeOnTheScreen());
    expect(screen.queryByText(/^Delete "trade binder"\?/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });
});
