import { fireEvent, screen, within } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { renderApp } from './render-app';
import {
  openSettings,
  pressTab,
  selectedTab,
  swipeDownPageSheet,
  tabBarLabels,
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

test('Collection says the collection is empty and that scanning adds cards', async () => {
  await renderApp();

  await pressTab('Collection');

  const collection = within(selectedTab());
  expect(collection.getByRole('header', { name: 'Collection' })).toBeOnTheScreen();
  expect(collection.getByText('Your collection is empty')).toBeOnTheScreen();
  expect(collection.getByText('Scan cards to add them to your collection.')).toBeOnTheScreen();
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
  'the settings button on %s opens the settings sheet',
  async (tab) => {
    await renderApp();
    await pressTab(tab);

    expect(await openSettings()).toBeOnTheScreen();
  },
);

test('Done closes the settings sheet', async () => {
  await renderApp();
  await openSettings();

  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('a downward swipe closes the settings sheet', async () => {
  await renderApp();
  await openSettings();

  await swipeDownPageSheet();

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
});
