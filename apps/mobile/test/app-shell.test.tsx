import { fireEvent, screen, within } from 'expo-router/testing-library';

import { startSignedIn } from './fake-supabase';
import { renderApp } from './render-app';
import {
  hasHeader,
  headerButton,
  isInScrollView,
  openSettings,
  presentedDrawer,
  pressTab,
  selectedTab,
  swipeDownDrawer,
  tabBarLabels,
  tabHeader,
  tapOutsideDrawer,
} from './native-ui';

beforeEach(() => {
  startSignedIn();
});

test('the app opens on Recent with its empty state', async () => {
  await renderApp();

  expect(tabHeader(selectedTab()).title).toBe('Recent');
  expect(within(selectedTab()).getByText('Nothing needs you yet')).toBeOnTheScreen();
});

test.each([
  [
    'Recent',
    'Nothing needs you yet',
    'Deck suggestions, planned swaps, and buylist cards show up here when they need you.',
  ],
  ['Decks', 'No decks yet', "A deck starts from a commander's card page."],
])('the empty state on %s has a white bold title and a muted message', async (tab, title, message) => {
  await renderApp();
  await pressTab(tab);

  const emptyState = within(selectedTab());
  expect(emptyState.getByText(title)).toHaveStyle({ color: 'rgba(255, 255, 255, 1)', fontSize: 14, fontWeight: '700' });
  expect(emptyState.getByText(message)).toHaveStyle({ color: 'rgba(181, 192, 197, 1)', fontSize: 14, lineHeight: 19 });
});

test.each([
  ['Recent', 'Nothing needs you yet'],
  ['Collection', 'Your collection is empty'],
  ['Decks', 'No decks yet'],
])('%s has the tab header with a large title over its scrolling content, and the settings button on the right', async (tab, content) => {
  await renderApp();
  await pressTab(tab);

  expect(tabHeader(selectedTab())).toEqual({
    title: tab,
    largeTitle: true,
    largeTitleType: { fontSize: 28, fontWeight: '800' },
    titleType: { fontSize: 17, fontWeight: '800' },
    buttons: ['Settings'],
  });
  expect(headerButton(selectedTab(), 'Settings')).toMatchObject({ type: 'button', symbol: 'gearshape.fill' });
  expect(isInScrollView(within(selectedTab()).getByText(content))).toBe(true);
});

test('the tab bar shows Recent, Collection, Decks, and Scan in that order', async () => {
  await renderApp();

  expect(tabBarLabels()).toEqual(['Recent', 'Collection', 'Decks', 'Scan']);
});

test("Decks says there are no decks yet and that a deck starts from a commander's card page", async () => {
  await renderApp();

  await pressTab('Decks');

  const decks = within(selectedTab());
  expect(tabHeader(selectedTab()).title).toBe('Decks');
  expect(decks.getByText('No decks yet')).toBeOnTheScreen();
  expect(decks.getByText("A deck starts from a commander's card page.")).toBeOnTheScreen();
});

test('Scan is a black screen with no header and no settings button', async () => {
  await renderApp();

  await pressTab('Scan');

  const scan = within(selectedTab());
  expect(scan.getByLabelText('Camera')).toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 1)' });
  expect(hasHeader(selectedTab())).toBe(false);
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

  expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5 });
});

test('the settings drawer can be dragged from half height to full height', async () => {
  await renderApp();

  await openSettings();

  expect(presentedDrawer().heights).toEqual([0.5, 1]);
});

test('the settings drawer has no Done button', async () => {
  await renderApp();

  await openSettings();

  expect(screen.queryByRole('button', { name: 'Done' })).not.toBeOnTheScreen();
});

test('the settings title stays at the top while the drawer content scrolls under it', async () => {
  await renderApp();

  const title = await openSettings();

  expect(isInScrollView(title)).toBe(false);
  expect(isInScrollView(screen.getByText('Gallery'))).toBe(true);
  expect(isInScrollView(screen.getByRole('switch', { name: 'Scan sounds' }))).toBe(true);
  expect(isInScrollView(screen.getByRole('button', { name: 'Sign out' }))).toBe(true);
});

test('a downward swipe closes the settings drawer', async () => {
  await renderApp();
  await openSettings();

  await swipeDownDrawer();

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
  expect(tabHeader(selectedTab()).title).toBe('Recent');
});

test('a tap outside closes the settings drawer', async () => {
  await renderApp();
  await openSettings();

  await tapOutsideDrawer();

  expect(screen.queryByRole('header', { name: 'Settings' })).not.toBeOnTheScreen();
  expect(tabHeader(selectedTab()).title).toBe('Recent');
});
