import { fireEvent, screen, within } from 'expo-router/testing-library';

import { processColor } from 'react-native';

import { copyOf, openCollection } from './copies';
import { collectionSearchesSent, ownCollectionTotal, ownCopies, ownUserTags, startSignedIn } from './fake-supabase';
import {
  headerButton,
  headerButtonBadge,
  isDrawerPresented,
  menuButtonNames,
  pressHeaderButton,
  presentedDrawer,
  presentedDrawerContent,
  selectedTab,
  swipeDownDrawer,
  tabHeader,
  typeInSearchBar,
} from './native-ui';
import { tokenColors } from './token-colors';

const { badge } = tokenColors;

beforeEach(() => {
  startSignedIn();
  ownCopies([copyOf('copy-1'), copyOf('copy-2')]);
  ownUserTags([
    { name: 'Signed', copyIds: ['copy-1'] },
    { name: 'Trade binder', copyIds: ['copy-2'] },
  ]);
  ownCollectionTotal({ total: '0.70', currency: 'USD', priced_copies: 2, copies: 2, stale: false, prices_observed_at: null });
});

function lastSearch() {
  return collectionSearchesSent().at(-1);
}

function chipLabels() {
  return within(selectedTab())
    .queryAllByRole('button')
    .filter((button) => button.props.accessibilityHint === 'Removes this chip.')
    .map((button) => button.props.accessibilityLabel);
}

function filtersSection(title: string) {
  return within(screen.getByRole('header', { name: title }).parent!);
}

function chosenFilters(title: string) {
  return filtersSection(title)
    .getAllByRole('button', { selected: true })
    .map((chip) => within(chip).getByText(/./).props.children);
}

function filterChoices(title: string) {
  return filtersSection(title)
    .getAllByRole('button')
    .map((chip) => within(chip).getByText(/./).props.children);
}

async function chooseFilter(title: string, label: string) {
  await fireEvent.press(filtersSection(title).getByRole('button', { name: label }));
}

async function chooseInFilters(title: string, label: string) {
  await openFilters();
  await chooseFilter(title, label);
  await swipeDownDrawer();
}

async function openFilters() {
  await pressHeaderButton(selectedTab(), filtersButtonName());
  await screen.findByRole('header', { name: 'Filters' });
}

function filtersButtonName() {
  return tabHeader(selectedTab()).buttons.find((name) => name?.startsWith('Filters'))!;
}

test('the Filters button sits in the header before the collection total button, with the filter symbol and no badge', async () => {
  await openCollection();

  expect(tabHeader(selectedTab()).buttons).toEqual(['Filters', 'Collection total, $0.70', 'Settings']);
  expect(headerButton(selectedTab(), 'Filters')).toMatchObject({ type: 'button', symbol: 'line.3.horizontal.decrease' });
  expect(headerButtonBadge(selectedTab(), 'Filters')).toBeNull();
});

test('the Filters button opens a half-height drawer titled Filters with only chips in it', async () => {
  await openCollection();

  await openFilters();

  expect(presentedDrawer()).toMatchObject({ showsGrabber: true, openingHeight: 0.5 });
  expect(filterChoices('Show')).toEqual(['All', 'Free', 'Allocated', 'Protected']);
  expect(filterChoices('With user tags')).toEqual(['Signed', 'Trade binder']);
  expect(filterChoices('Without user tags')).toEqual(['Signed', 'Trade binder']);
  expect(filterChoices('Finish')).toEqual(['Any', 'Nonfoil', 'Foil', 'Etched']);
  expect(filterChoices('Condition')).toEqual(['Any', 'NM', 'LP', 'MP', 'HP', 'DMG']);
  expect(filterChoices('Language')).toEqual([
    'Any',
    'English',
    'Japanese',
    'German',
    'French',
    'Italian',
    'Spanish',
    'Portuguese',
    'Korean',
    'Russian',
    'Simplified Chinese',
    'Traditional Chinese',
  ]);
  for (const title of ['Show', 'Finish', 'Condition', 'Language']) {
    expect(chosenFilters(title)).toEqual([title === 'Show' ? 'All' : 'Any']);
  }
  expect(within(presentedDrawerContent()).getAllByRole('button')).toHaveLength(4 + 2 + 2 + 4 + 6 + 12);
  expect(within(presentedDrawerContent()).queryAllByRole('button', { selected: false })).toHaveLength(4 + 2 + 2 + 4 + 6 + 12 - 4);
});

test('with no user tags, the drawer leaves out the user tag sections', async () => {
  ownUserTags([]);
  await openCollection();

  await openFilters();

  expect(screen.queryByRole('header', { name: 'With user tags' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Without user tags' })).not.toBeOnTheScreen();
  expect(filterChoices('Show')).toEqual(['All', 'Free', 'Allocated', 'Protected']);
});

test('Free sends free copies that are not protected, Allocated sends copies in decks, Protected sends protected copies, and All sends none', async () => {
  await openCollection();

  await chooseInFilters('Show', 'Free');
  expect(lastSearch()).toEqual({ is_free: true, is_protected: false });

  await chooseInFilters('Show', 'Allocated');
  expect(chipLabels()).toEqual(['is:allocated']);
  expect(lastSearch()).toEqual({ is_allocated: true });

  await chooseInFilters('Show', 'Protected');
  expect(lastSearch()).toEqual({ is_protected: true });

  await chooseInFilters('Show', 'All');
  expect(lastSearch()).toEqual({});
});

test('drawer choices show as chips under the search bar, and the badge counts the filters for the eye and for VoiceOver', async () => {
  await openCollection();
  await openFilters();

  await chooseFilter('Show', 'Free');
  await chooseFilter('With user tags', 'Trade binder');
  await chooseFilter('Without user tags', 'Signed');
  await chooseFilter('Condition', 'LP');
  await swipeDownDrawer();

  expect(chipLabels()).toEqual(['is:free', '-is:protected', 'user_tag:"Trade binder"', '-user_tag:Signed', 'condition:lp']);
  expect(lastSearch()).toEqual({
    is_free: true,
    is_protected: false,
    user_tags: ['Trade binder'],
    user_tags_exclude: ['Signed'],
    conditions: ['lightly_played'],
  });
  expect(headerButtonBadge(selectedTab(), 'Filters, 4')).toEqual({ count: '4', color: processColor(badge) });
});

test('Free counts as one filter in the badge, though it is two chips', async () => {
  await openCollection();

  await chooseInFilters('Show', 'Free');

  expect(chipLabels()).toEqual(['is:free', '-is:protected']);
  expect(headerButtonBadge(selectedTab(), 'Filters, 1')).toEqual({ count: '1', color: processColor(badge) });
});

test('Allocated counts as one filter in the badge', async () => {
  await openCollection();

  await chooseInFilters('Show', 'Allocated');

  expect(headerButtonBadge(selectedTab(), 'Filters, 1')).toEqual({ count: '1', color: processColor(badge) });
});

test('a typed is:allocated chip selects Allocated in the drawer', async () => {
  await openCollection();
  await typeInSearchBar('is:allocated ');

  await openFilters();

  expect(chosenFilters('Show')).toEqual(['Allocated']);
});

test('typed chips count one filter each, and typed Free chips count as one', async () => {
  await openCollection();

  await typeInSearchBar('set:mh2 is:free ');
  expect(headerButtonBadge(selectedTab(), 'Filters, 2')?.count).toBe('2');

  await typeInSearchBar('-is:protected ');
  expect(headerButtonBadge(selectedTab(), 'Filters, 2')?.count).toBe('2');
});

test('the collection searches again when the Filters drawer closes', async () => {
  await openCollection();
  await openFilters();
  const searchesBefore = collectionSearchesSent().length;

  await chooseFilter('Finish', 'Foil');
  expect(collectionSearchesSent()).toHaveLength(searchesBefore);

  await swipeDownDrawer();
  expect(lastSearch()).toEqual({ finishes: ['foil'] });
});

test('one choice each for finish, condition, and language: a new choice replaces the old one, and Any removes it', async () => {
  await openCollection();
  await openFilters();

  await chooseFilter('Finish', 'Foil');
  await chooseFilter('Finish', 'Etched');
  await chooseFilter('Language', 'Japanese');
  expect(chosenFilters('Finish')).toEqual(['Etched']);
  expect(chosenFilters('Language')).toEqual(['Japanese']);
  await swipeDownDrawer();
  expect(lastSearch()).toEqual({ finishes: ['etched'], languages: ['ja'] });

  await chooseInFilters('Finish', 'Any');
  expect(lastSearch()).toEqual({ languages: ['ja'] });
  await openFilters();
  expect(chosenFilters('Finish')).toEqual(['Any']);
});

test('a user tag chip in the drawer puts its chip on and takes it off', async () => {
  await openCollection();

  await chooseInFilters('With user tags', 'Signed');
  expect(chipLabels()).toEqual(['user_tag:Signed']);
  expect(lastSearch()).toEqual({ user_tags: ['Signed'] });

  await chooseInFilters('With user tags', 'Signed');
  expect(chipLabels()).toEqual([]);
  expect(lastSearch()).toEqual({});
});

test('a user tag chosen in Without user tags leaves With user tags', async () => {
  await openCollection();
  await openFilters();

  await chooseFilter('With user tags', 'Signed');
  await chooseFilter('Without user tags', 'Signed');

  expect(filtersSection('With user tags').queryAllByRole('button', { selected: true })).toEqual([]);
  expect(chosenFilters('Without user tags')).toEqual(['Signed']);
  await swipeDownDrawer();
  expect(lastSearch()).toEqual({ user_tags_exclude: ['Signed'] });
});

test('typed chips select their choices in the drawer', async () => {
  await openCollection();
  await typeInSearchBar('finish:foil user_tag:signed -user_tag:"trade binder" is:protected lang:ja ');

  await openFilters();

  expect(chosenFilters('Finish')).toEqual(['Foil']);
  expect(chosenFilters('With user tags')).toEqual(['Signed']);
  expect(chosenFilters('Without user tags')).toEqual(['Trade binder']);
  expect(chosenFilters('Show')).toEqual(['Protected']);
  expect(chosenFilters('Language')).toEqual(['Japanese']);
  expect(chosenFilters('Condition')).toEqual(['Any']);
});

test('removing a chip under the search bar clears its choice in the drawer', async () => {
  await openCollection();
  await openFilters();
  await chooseFilter('Finish', 'Foil');
  await swipeDownDrawer();

  await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'finish:foil' }));
  expect(headerButtonBadge(selectedTab(), 'Filters')).toBeNull();
  await openFilters();

  expect(chosenFilters('Finish')).toEqual(['Any']);
});

test('the sort and Sets buttons hide while the Filters drawer is open and come back when it closes', async () => {
  await openCollection();
  expect(menuButtonNames(selectedTab())).toEqual(['Sort, Relevance']);
  expect(within(selectedTab()).getByRole('button', { name: 'Sets' })).toBeOnTheScreen();

  await openFilters();
  expect(menuButtonNames(selectedTab())).toEqual([]);
  expect(within(selectedTab()).queryByRole('button', { name: 'Sets' })).toBeNull();

  await swipeDownDrawer();
  expect(isDrawerPresented()).toBe(false);
  expect(menuButtonNames(selectedTab())).toEqual(['Sort, Relevance']);
  expect(within(selectedTab()).getByRole('button', { name: 'Sets' })).toBeOnTheScreen();
});
