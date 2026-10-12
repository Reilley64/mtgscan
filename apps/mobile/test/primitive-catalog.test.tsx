import { fireEvent, screen } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { presentedDrawer } from './native-ui';
import { renderApp } from './render-app';

beforeEach(() => {
  startSignedIn();
});

test('the primitive catalog shows every primitive', async () => {
  await renderApp('/primitives');

  for (const section of ['Text styles', 'Buttons', 'Chips', 'Toggles', 'Surfaces', 'List rows', 'Switches', 'Drawer sheet']) {
    expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
  }
  expect(screen.getByRole('button', { name: 'Busy' })).toBeBusy();
  expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Protect' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Copies', checked: true })).toBeOnTheScreen();
  expect(screen.getByRole('switch', { name: 'Scan sounds' })).toBeChecked();
});

test('the primitive catalog opens the drawer sheet sample as a bottom drawer', async () => {
  await renderApp('/primitives');

  await fireEvent.press(screen.getByRole('button', { name: 'Open the drawer sheet' }));

  expect(await screen.findByRole('header', { name: 'Drawer sheet' })).toBeOnTheScreen();
  expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5, heights: [0.5, 1] });
});
