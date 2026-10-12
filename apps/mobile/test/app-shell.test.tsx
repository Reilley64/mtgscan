import { fireEvent, screen, within } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { renderApp } from './render-app';
import {
  openSettings,
  openSheet,
  pressTab,
  selectedTab,
  swipeDownSheet,
  tabBarLabels,
  tapOutsideSheet,
} from './native-ui';

beforeEach(() => {
  startSignedIn();
});

test('the app opens on Recent with its empty state', async () => {
  await renderApp();

  const recent = within(selectedTab());
  expect(recent.getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
  expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen();
});

test('the tab bar shows Recent, Collection, Decks, and Scan in that order', async () => {
  await renderApp();

  expect(tabBarLabels()).toEqual(['Recent', 'Collection', 'Decks', 'Scan']);
});

test("Decks says there are no decks yet and that a deck starts from a commander's card page", async () => {
  await renderApp();

  await pressTab('Decks');

  const decks = within(selectedTab());
  expect(decks.getByRole('header', { name: 'Decks' })).toBeOnTheScreen();
  expect(decks.getByText('No decks yet')).toBeOnTheScreen();
  expect(decks.getByText("A deck starts from a commander's card page.")).toBeOnTheScreen();
});

test('Scan is a black screen with no settings button', async () => {
  await renderApp();

  await pressTab('Scan');

  const scan = within(selectedTab());
  expect(scan.getByLabelText('Camera')).toHaveStyle({ backgroundColor: '#000000' });
  expect(scan.queryByRole('button', { name: 'Settings' })).not.toBeOnTheScreen();
});

test.each(['Recent', 'Collection', 'Decks'])(
  'the settings button on %s opens the settings drawer',
  async (tab) => {
    await renderApp();
    await pressTab(tab);

    expect(await openSettings()).toBeOnTheScreen();
  },
);

test('settings opens as a bottom drawer with a grabber at half height', async () => {
  await renderApp();

  await openSettings();

  expect(openSheet()).toMatchObject({ showsGrabber: true, openingHeight: 0.5 });
});

test('the settings drawer can be dragged from half height to full height', async () => {
  await renderApp();

  await openSettings();

  expect(openSheet().heights).toEqual([0.5, 1]);
});

test('the settings drawer has no Done button', async () => {
  await renderApp();

  await openSettings();

  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeOnTheScreen();
});

test('a downward swipe closes the settings drawer', async () => {
  await renderApp();
  await openSettings();

  await swipeDownSheet();

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('a tap outside closes the settings drawer', async () => {
  await renderApp();
  await openSettings();

  await tapOutsideSheet();

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});
