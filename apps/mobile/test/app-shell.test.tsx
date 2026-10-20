import { fireEvent, screen, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { startSignedIn } from './fake-supabase';
import { renderApp } from './render-app';
import {
  appearsBefore,
  hasHeader,
  headerButton,
  isInScrollView,
  openSettings,
  presentedDrawer,
  presentedDrawerContent,
  pressTab,
  selectedTab,
  swipeDownDrawer,
  tabBarLabels,
  tabHeader,
  tapOutsideDrawer,
} from './native-ui';
import { tokenColors } from './token-colors';

const { textDim } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

test('the app opens on Recent with its empty state', async () => {
  await renderApp();

  expect(tabHeader(selectedTab()).title).toBe('Recent');
  expect(within(selectedTab()).getByText('Nothing needs you yet')).toBeOnTheScreen();
});

test.each([
  ['Recent', 'Nothing needs you yet', 'Planned swaps and buylist cards from your AI chat show up here.'],
  ['Decks', 'No decks yet', 'Create a deck, then add cards to it from your collection.'],
])('the empty state on %s has a white title in sheet title type and a muted message, read as one', async (tab, title, message) => {
  await renderApp();
  await pressTab(tab);

  const emptyState = within(selectedTab());
  expect(emptyState.getByText(title)).toHaveStyle({ color: 'rgba(255, 255, 255, 1)', fontSize: 17, fontWeight: '800' });
  expect(emptyState.getByText(message)).toHaveStyle({ color: 'rgba(181, 192, 197, 1)', fontSize: 14, lineHeight: 19 });
  expect(emptyState.getByLabelText(`${title}, ${message}`)).toHaveProp('accessible', true);
});

test('Recent has no action and no filter chips while it is empty', async () => {
  await renderApp();

  const recent = within(selectedTab());
  expect(recent.getByText('Nothing needs you yet')).toBeOnTheScreen();
  expect(recent.queryAllByRole('button')).toEqual([]);
  for (const filter of ['All', 'Suggestions', 'Planned swaps', 'Buylist']) {
    expect(recent.queryByText(filter)).not.toBeOnTheScreen();
  }
});

test.each([
  ['Recent', 'Nothing needs you yet', ['Settings']],
  ['Collection', 'Your collection is empty', ['Filters', 'Settings']],
  ['Decks', 'No decks yet', ['Create deck', 'Settings']],
])('%s has the tab header with a large title over its scrolling content, and the settings button on the right', async (tab, content, buttons) => {
  await renderApp();
  await pressTab(tab);

  expect(tabHeader(selectedTab())).toEqual({
    title: tab,
    largeTitle: true,
    largeTitleType: { fontSize: 28, fontWeight: '800' },
    titleType: { fontSize: 17, fontWeight: '800' },
    buttons,
  });
  expect(headerButton(selectedTab(), 'Settings')).toMatchObject({ type: 'button', symbol: 'gearshape.fill' });
  expect(isInScrollView(within(selectedTab()).getByText(content))).toBe(true);
});

test('the tab bar shows Recent, Collection, Decks, and Scan in that order', async () => {
  await renderApp();

  expect(tabBarLabels()).toEqual(['Recent', 'Collection', 'Decks', 'Scan']);
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

test('the settings drawer shows the Fan Content notice in dim credit type under Sign out, with no Scryfall price note', async () => {
  await renderApp();

  await openSettings();

  const notice = screen.getByText(
    'mtgscan is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.',
  );
  expect(notice).toHaveStyle({ color: textDim, fontSize: 10, fontWeight: '600' });
  expect(isInScrollView(notice)).toBe(true);
  expect(appearsBefore(screen.getByRole('button', { name: 'Sign out' }), notice)).toBe(true);
  expect(within(presentedDrawerContent()).queryByText(/Scryfall/)).not.toBeOnTheScreen();
});

test('under the Fan Content notice, the settings drawer says in dim credit type that card recognition uses PE-Core S16 under the Apache License 2.0', async () => {
  await renderApp();

  await openSettings();

  const notice = screen.getByText('Card recognition uses PE-Core S16 by Meta, under the Apache License 2.0.');
  expect(notice).toHaveStyle({ color: textDim, fontSize: 10, fontWeight: '600' });
  expect(isInScrollView(notice)).toBe(true);
  expect(appearsBefore(screen.getByText(/^mtgscan is unofficial Fan Content/), notice)).toBe(true);
});

test('Apache License 2.0 in the settings drawer opens the licence text in the system browser', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce();
  await renderApp();
  await openSettings();

  await fireEvent.press(screen.getByRole('link', { name: 'Apache License 2.0' }));

  expect(openURL).toHaveBeenCalledWith('https://www.apache.org/licenses/LICENSE-2.0');
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
