import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { presentedDrawer } from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

test('the primitive catalog shows every primitive', async () => {
  await renderApp('/primitives');

  for (const section of ['Text styles', 'Brand', 'Buttons', 'Sign-in buttons', 'Chips', 'Toggles', 'Surfaces', 'List rows', 'Card tiles', 'Switches', 'Drawer sheet']) {
    expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Protect' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: 'Scan sounds' })).toBeChecked();
  expect(screen.getByRole('image', { name: 'Sol Ring, CMM 464, 2 owned' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sign in with Apple' })).toBeBusy();
  expect(screen.getAllByRole('button', { name: 'Continue with Google' }).map((button) => button.props.accessibilityState.busy)).toEqual([false, true]);
  expect(screen.getByRole('button', { name: 'Sign-in disabled' })).toBeDisabled();
  expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Text link' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, CMM 464', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sol Ring, C21 263', selected: false })).toBeOnTheScreen();
});

test('the primitive catalog opens the drawer sheet sample as a bottom drawer', async () => {
  await renderApp('/primitives');

  await fireEvent.press(screen.getByRole('button', { name: 'Open the drawer sheet' }));

  expect(await screen.findByRole('header', { name: 'Drawer sheet' })).toBeOnTheScreen();
  expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5, heights: [0.5, 1] });
});
