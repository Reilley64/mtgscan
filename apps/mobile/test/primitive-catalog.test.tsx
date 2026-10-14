import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { presentedDrawer } from './native-ui';
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
    'Toggles',
    'Surfaces',
    'List rows',
    'Card tiles',
    'Switches',
    'Quick actions',
    'Count badges',
    'Skeletons',
    'Glass',
    'Pull indicators',
    'Inputs',
    'Progress bars',
    'Sheet sections',
    'Swipe to confirm',
    'Drawer sheet',
  ]) {
    expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Protect' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: 'Scan sounds' })).toBeChecked();
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, foil, lightly played, $1,635.37' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, C21 263, etched, no price' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Sol Ring, M10 216, $1.25' })).toHaveProp('accessibilityHint', 'The price may be out of date.');
  expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeBusy();
  expect(screen.getAllByRole('button', { name: 'Continue with Google' }).map((button) => button.props.accessibilityState.busy)).toEqual([false, true]);
  expect(screen.getByRole('button', { name: 'Sign-in disabled' })).toBeDisabled();
  expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
  expect(screen.getByRole('alert', { name: 'Could not add to your collection. Your scans are kept.' })).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Text link' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'set:mh2' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'set:zzz' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Nonfoil' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'M10' })).toBeEnabled();
  expect(screen.getAllByRole('button', { name: 'JA' }).at(-1)).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Swipe to confirm' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Swipe busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Swipe disabled' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Swipe busy and disabled' })).toBeBusy();
  expect(screen.getByLabelText('Card name')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Loading collection' })).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Downloading gallery' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Other options' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, C21 263', selected: false })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch, 12' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  for (const pullIndicator of ['Pull to add 3 cards', 'Release to add 3 cards', 'Nothing to add', 'Adding 3 cards', 'Failed to add']) {
    expect(screen.getByText(pullIndicator)).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464, Foil' })).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Recognizing card' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Scan batch, 3' })).toBeOnTheScreen();
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
