import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { buttonMenuActions, contextMenu, menuButtonNames, presentedDrawer } from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

test('the primitive catalog shows every primitive', async () => {
  await renderApp('/primitives');

  for (const section of [
    'Text styles',
    'Brand',
    'Buttons',
    'Sign-in buttons',
    'Chips',
    'Card symbols',
    'Toggles',
    'Surfaces',
    'List rows',
    'Card tiles',
    'Card heroes',
    'Value rows',
    'Switches',
    'Quick actions',
    'Count badges',
    'Skeletons',
    'Glass',
    'Floating menu buttons',
    'Floating buttons',
    'Set rows',
    'Set banners',
    'Pull indicators',
    'Inputs',
    'Progress bars',
    'Sheet sections',
    'Stepper rows',
    'Deck tags',
    'Rule rows',
    'Swipe to confirm',
    'Empty states',
    'Drawer sheet',
  ]) {
    expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Protect' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Planned, 2' })).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: 'Scan sounds' })).toBeChecked();
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, foil, lightly played, $1,635.37' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, C21 263, etched, no price' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, $1.25' })).toHaveProp('accessibilityHint', 'The price may be out of date.');
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, protected, $1.25' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, protected, in the deck Atraxa, $1.25' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, C21 263, in the deck Atraxa, $1.25' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeBusy();
  expect(screen.getAllByRole('button', { name: 'Continue with Google' }).map((button) => button.props.accessibilityState.busy)).toEqual([false, true]);
  expect(screen.getByRole('button', { name: 'Sign-in disabled' })).toBeDisabled();
  expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
  expect(screen.getByRole('alert', { name: 'Could not add to your collection. Your scans are kept.' })).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Text link' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Atraxa' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Kinnan, High priority · 0 cards' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Tymna, Medium priority · 100 cards, Would make Tymna invalid: deck size' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Creatures, 3' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Variants, 1 of 2' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Magic 2010, 234 of 261, 89 percent' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, number 216, owned, 2 copies' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, number 216, not owned' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Island, basic land, unlimited' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, C21 263, breaks a Commander rule' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Mountain, long press for a menu, breaks a Commander rule' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Remove one Island' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Remove one Plains' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add one Swamp' })).toBeDisabled();
  expect(screen.getByLabelText('tap: Add colorless mana colorless mana. Spend X generic mana two generic mana white mana blue mana black mana red mana green mana or snow mana.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Deck validity, Valid' })).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: 'Deck validity, Invalid' })).toHaveLength(3);
  expect(
    screen.getAllByRole('button', { name: 'Deck validity, Invalid' }).filter((chip) => chip.props.accessibilityHint === 'The rules data may be out of date.'),
  ).toHaveLength(1);
  expect(screen.getAllByLabelText('Bracket 3').filter((chip) => chip.props.accessibilityHint === 'The rules data may be out of date.')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Deck validity, Cannot be determined' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Yuriko, Medium priority, 87 cards, Invalid, Estimated bracket 4' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Estimated bracket 4' })).toBeOnTheScreen();
  expect(screen.getByText('Infinite colorless mana (Commander Spellbook, ruthless)')).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'CR 903.5a' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'set:mh2' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'set:zzz' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Trade binder', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Nonfoil' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'M10' })).toBeEnabled();
  expect(screen.getAllByRole('button', { name: 'JA' }).at(-1)).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Swipe to confirm' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Swipe busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Swipe disabled' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Swipe busy and disabled' })).toBeBusy();
  expect(screen.getByLabelText('Card name')).toBeOnTheScreen();
  expect(screen.getByRole('checkbox', { name: 'Signed, 3 copies' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Trade binder, 1 copy' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'User tags, signed, trade binder' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add user tags' })).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Loading collection' })).toBeOnTheScreen();
  expect(menuButtonNames(screen.container)).toEqual(['More, Misprint', 'Group, Type', 'Sort, Relevance', 'Sort, Price, high to low']);
  expect(screen.getByRole('progressbar', { name: 'Downloading gallery' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Other options' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Protected')).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, large' })).toBeOnTheScreen();
  expect(screen.getByText('Could not load this card')).toBeOnTheScreen();
  expect(screen.getByLabelText('Current price, $1.25')).toHaveProp('accessibilityHint', 'The price may be out of date.');
  expect(screen.getByLabelText('ChatGPT, Allowed 16 October 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText('Added, Reverted, 16 October 2026 at 18:05')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464', selected: true })).toBeOnTheScreen();
  expect(buttonMenuActions(contextMenu(screen.getByRole('button', { name: 'Sol Ring, M10 216, long press for a menu' })))).toEqual([
    { title: 'Open card', destructive: false },
    { title: 'Make commander', destructive: false },
    { title: 'Remove from deck', destructive: true },
  ]);
  expect(screen.getByRole('checkbox', { name: 'Misprint, 0 copies' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, C21 263', selected: false })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch, 12' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  for (const pullIndicator of ['Pull to add 3 cards', 'Release to add 3 cards', 'Nothing to add', 'Adding 3 cards', 'Failed to add']) {
    expect(screen.getByText(pullIndicator)).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464, Foil' })).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Recognizing card' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch, 3' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Your collection is empty, Scan cards to add them to your collection.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan cards' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Camera not available, This device has no camera.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Nothing needs you yet, When a deck needs you, it shows up here.')).toBeOnTheScreen();
  expect(screen.getByLabelText('No decks yet, Create a deck, then add cards to it from your collection.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Atraxa, Medium priority, 0 cards' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Krenko, Needs you 2, High priority, 1 card' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Kinnan' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Open the name alert' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Open the name alert with a name' })).toBeOnTheScreen();
  expect(screen.getByLabelText('No scans yet, Cards you scan wait here until you add them.')).toBeOnTheScreen();
});

test('the primitive catalog opens the drawer sheet sample as a bottom drawer', async () => {
  await renderApp('/primitives');

  await fireEvent.press(screen.getByRole('button', { name: 'Open the drawer sheet' }));

  expect(await screen.findByRole('header', { name: 'Drawer sheet' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'The footer stays at the bottom' })).toBeOnTheScreen();
  expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5, heights: [0.5, 1] });
});

test('the primitive catalog opens the full-height drawer sheet sample at full height only', async () => {
  await renderApp('/primitives');

  await fireEvent.press(screen.getByRole('button', { name: 'Open the full-height drawer sheet' }));

  expect(await screen.findByRole('header', { name: 'Full-height drawer sheet' })).toBeOnTheScreen();
  expect(presentedDrawer()).toEqual({ showsGrabber: true, openingHeight: 1, heights: [1] });
});
