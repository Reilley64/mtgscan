import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { ScrollView, StyleSheet } from 'react-native';

import { tokenColors } from './token-colors';

function hostViews(type: string) {
  return screen.container.queryAll((instance) => instance.type === type);
}

function tabBar() {
  const [host] = hostViews('RNSTabsHostIOS');
  if (!host) {
    throw new Error('No tab bar is on the screen');
  }
  return host;
}

function tabScreens() {
  return hostViews('RNSTabsScreenIOS');
}

function tabScreen(matches: (props: Record<string, any>) => boolean, description: string) {
  const screenForTab = tabScreens().find((candidate) => matches(candidate.props));
  if (!screenForTab) {
    throw new Error(`No tab ${description}. Tabs: ${tabBarLabels().join(', ')}`);
  }
  return screenForTab;
}

export function tabBarLabels(): string[] {
  return tabScreens().map((candidate) => candidate.props.title);
}

export function selectedTab() {
  const { selectedScreenKey } = tabBar().props.navStateRequest;
  return tabScreen((props) => props.screenKey === selectedScreenKey, 'is selected');
}

export async function pressTab(label: string) {
  const { screenKey } = tabScreen((props) => props.title === label, `is labelled ${label}`).props;
  await fireEvent(tabBar(), 'tabSelected', {
    nativeEvent: { selectedScreenKey: screenKey, provenance: 0, actionOrigin: 'user' },
  });
}

function presentedDrawerView() {
  const drawer = hostViews('RNSModalScreen')
    .filter((candidate) => candidate.props.stackPresentation === 'formSheet')
    .at(-1);
  if (!drawer) {
    throw new Error('No drawer is open');
  }
  const {
    sheetGrabberVisible = false,
    sheetAllowedDetents = [1],
    sheetInitialDetent = 0,
    sheetLargestUndimmedDetent = -1,
    gestureEnabled = true,
  } = drawer.props;
  return {
    view: drawer,
    showsGrabber: sheetGrabberVisible as boolean,
    heights: sheetAllowedDetents as number[],
    openingIndex: sheetInitialDetent as number,
    largestUndimmedIndex: sheetLargestUndimmedDetent as number,
    closesByGesture: gestureEnabled as boolean,
  };
}

export function isDrawerPresented() {
  return hostViews('RNSModalScreen').some((candidate) => candidate.props.stackPresentation === 'formSheet');
}

export function isInScrollView(element: HostElement) {
  let parent = element.parent;
  while (parent) {
    if (parent.type === 'RCTScrollView') {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

export function presentedDrawer() {
  const { showsGrabber, heights, openingIndex } = presentedDrawerView();
  return { showsGrabber, heights, openingHeight: heights[openingIndex] };
}

async function closeDrawerByGesture(drawer: ReturnType<typeof presentedDrawerView>) {
  if (!drawer.closesByGesture) {
    throw new Error('This drawer does not close by gesture');
  }
  await fireEvent(drawer.view, 'dismissed', { nativeEvent: { dismissCount: 1 } });
}

export async function swipeDownDrawer() {
  await closeDrawerByGesture(presentedDrawerView());
}

export async function tapOutsideDrawer() {
  const drawer = presentedDrawerView();
  if (drawer.heights[drawer.openingIndex] === 1) {
    throw new Error('A drawer at full height leaves no screen outside it to tap');
  }
  if (drawer.largestUndimmedIndex >= drawer.openingIndex) {
    throw new Error('The screen behind this drawer is not dimmed, so a tap there does not close it');
  }
  await closeDrawerByGesture(drawer);
}

const swipeTrackWidth = 360;

function swipeTrack(control: HostElement) {
  const [track] = control.queryAll((instance) => instance.type === 'RCTScrollView');
  if (!track) {
    throw new Error('Nothing in this control can be swiped');
  }
  return track;
}

const swipeDrags = new Map<HostElement, { offset: number; scrollsBefore: number }>();

function scrollToCalls() {
  return jest.mocked(ScrollView.prototype.scrollTo).mock;
}

function rendersTrack(scrollView: ScrollView, track: HostElement) {
  return scrollView.props.onScrollEndDrag === track.props.onScrollEndDrag;
}

function handlePosition(track: HostElement, offset: number) {
  const travel = track.props.contentOffset.x;
  return (travel - offset) / travel;
}

function scrollTarget(call: unknown[]) {
  return (call[0] as { x: number }).x;
}

function scrollEvent(x: number) {
  return { nativeEvent: { contentOffset: { x, y: 0 } } };
}

export async function beginSwipe(control: HostElement) {
  await fireEvent(control, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: swipeTrackWidth, height: 52 } } });
  const track = () => swipeTrack(control);
  const enabled = track().props.scrollEnabled !== false;
  const travel = track().props.contentOffset.x;
  let offset = travel;
  if (enabled) {
    await fireEvent(track(), 'scrollBeginDrag', scrollEvent(offset));
  }
  return {
    moveTo: async (fractionOfWidth: number) => {
      if (enabled) {
        offset = Math.max(0, travel - swipeTrackWidth * fractionOfWidth);
        swipeDrags.set(track(), { offset, scrollsBefore: scrollToCalls().calls.length });
        await fireEvent(track(), 'scroll', scrollEvent(offset));
      }
    },
    release: async () => {
      if (enabled) {
        swipeDrags.set(track(), { offset, scrollsBefore: scrollToCalls().calls.length });
        await fireEvent(track(), 'scrollEndDrag', scrollEvent(offset));
      }
    },
  };
}

export async function swipeRight(control: HostElement, fractionOfWidth: number) {
  const swipe = await beginSwipe(control);
  await swipe.moveTo(fractionOfWidth);
  await swipe.release();
}

export function swipeHandlePosition(control: HostElement) {
  const track = swipeTrack(control);
  const scrolls = scrollToCalls();
  const latestScroll = scrolls.contexts.findLastIndex((scrollView: ScrollView) => rendersTrack(scrollView, track));
  const drag = swipeDrags.get(track);
  if (drag && drag.scrollsBefore > latestScroll) {
    return handlePosition(track, drag.offset);
  }
  return latestScroll === -1 ? 0 : handlePosition(track, scrollTarget(scrolls.calls[latestScroll]));
}

export function swipeHandleMovesAfterRelease(control: HostElement) {
  const track = swipeTrack(control);
  const scrolls = scrollToCalls();
  const release = swipeDrags.get(track)?.scrollsBefore ?? 0;
  return scrolls.calls.flatMap((call, index) =>
    index >= release && rendersTrack(scrolls.contexts[index], track) ? [handlePosition(track, scrollTarget(call))] : [],
  );
}

export function presentedDrawerCount() {
  return hostViews('RNSModalScreen').filter((candidate) => candidate.props.stackPresentation === 'formSheet').length;
}

function drawerStackScreens() {
  return presentedDrawerView().view.queryAll((instance) => instance.type === 'RNSScreen');
}

function headerOf(stackScreen: HostElement) {
  const [header] = stackScreen.queryAll((instance) => instance.type === 'RNSScreenStackHeaderConfig');
  return header.props;
}

export function drawerBackButton() {
  const [previous, current] = drawerStackScreens().slice(-2);
  if (!current) {
    return null;
  }
  const header = headerOf(current);
  if (header.hidden || header.hideBackButton) {
    return null;
  }
  return { label: (header.backTitle ?? headerOf(previous).title) as string };
}

async function popDrawerScreen() {
  const [current] = drawerStackScreens().slice(-1);
  await fireEvent(current, 'dismissed', { nativeEvent: { dismissCount: 1 } });
}

export function drawerScreen() {
  const [current] = drawerStackScreens().slice(-1);
  return current;
}

export function drawerTitle() {
  const header = headerOf(drawerScreen());
  if (header.hidden) {
    throw new Error('This drawer screen shows no title bar');
  }
  return header.title as string;
}

export async function pressDrawerBack() {
  if (!drawerBackButton()) {
    throw new Error('This drawer shows no back button');
  }
  await popDrawerScreen();
}

export async function swipeBackFromTheLeftEdge() {
  const [current] = drawerStackScreens().slice(-1);
  if (drawerStackScreens().length < 2 || current.props.gestureEnabled === false) {
    throw new Error('This drawer screen does not go back with a swipe from the left edge');
  }
  await popDrawerScreen();
}

export function opacityOf(element: HostElement) {
  return StyleSheet.flatten(element.props.style)?.opacity ?? 1;
}

export function showsSpinner(element: ReturnType<typeof screen.getByRole>) {
  return element.queryAll((instance) => instance.type === 'ActivityIndicator').length > 0;
}

type HeaderItem = {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  buttonId?: string;
  sfSymbolName?: string;
  disabled?: boolean;
  menu?: { title: string; items: HeaderMenuItem[] };
};

type HeaderMenuItem = {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  destructive?: boolean;
  menuId?: string;
  items?: HeaderMenuItem[];
};

function shownHeaderConfigs(tab: HostElement) {
  return tab.queryAll((instance) => instance.type === 'RNSScreenStackHeaderConfig' && !instance.props.hidden);
}

export function hasHeader(tab: HostElement) {
  return shownHeaderConfigs(tab).length > 0;
}

function tabHeaderConfig(tab: HostElement) {
  const [config] = shownHeaderConfigs(tab);
  if (!config) {
    throw new Error('This tab has no header');
  }
  return config;
}

function headerItems(tab: HostElement): HeaderItem[] {
  return [...(tabHeaderConfig(tab).props.headerRightBarButtonItems ?? [])].reverse();
}

function headerItem(tab: HostElement, name: string) {
  const item = headerItems(tab).find((candidate) => (candidate.accessibilityLabel ?? candidate.title) === name);
  if (!item) {
    throw new Error(`No header button is named ${name}`);
  }
  return item;
}

export function tabHeader(tab: HostElement) {
  const { title, largeTitle, largeTitleFontSize, largeTitleFontWeight, titleFontSize, titleFontWeight } =
    tabHeaderConfig(tab).props;
  return {
    title,
    largeTitle: Boolean(largeTitle),
    largeTitleType: { fontSize: largeTitleFontSize, fontWeight: largeTitleFontWeight },
    titleType: { fontSize: titleFontSize, fontWeight: titleFontWeight },
    buttons: headerItems(tab).map((item) => item.accessibilityLabel ?? item.title),
  };
}

export function headerTitles() {
  return shownHeaderConfigs(screen.container).map((config) => config.props.title);
}

export function headerButton(tab: HostElement, name: string) {
  const { type, title, accessibilityHint, sfSymbolName } = headerItem(tab, name);
  return { type, label: title || undefined, symbol: sfSymbolName, hint: accessibilityHint };
}

function menuOf(tab: HostElement, name: string) {
  const { menu } = headerItem(tab, name);
  if (!menu) {
    throw new Error(`The header button ${name} has no menu`);
  }
  return menu;
}

export function headerMenu(tab: HostElement, name: string) {
  const { title, items } = menuOf(tab, name);
  return { title, items: items.map(({ title: itemTitle, subtitle }) => ({ title: itemTitle, subtitle })) };
}

export function pressableMenuRows(tab: HostElement, name: string) {
  return menuOf(tab, name)
    .items.filter((item) => !item.disabled)
    .map((item) => item.title);
}

export function headerButtonIsDisabled(host: HostElement, name: string) {
  return headerItem(host, name).disabled ?? false;
}

type MenuRow = { title: string; destructive: boolean; rows?: MenuRow[] };

function menuRows(items: HeaderMenuItem[]): MenuRow[] {
  return items.map((item) => ({
    title: item.title,
    destructive: item.destructive ?? false,
    ...(item.items ? { rows: menuRows(item.items) } : {}),
  }));
}

export function headerMenuRows(host: HostElement, name: string) {
  return menuRows(menuOf(host, name).items);
}

export async function pressHeaderMenuAction(host: HostElement, name: string, path: string[]) {
  let items = menuOf(host, name).items;
  let chosen: HeaderMenuItem | undefined;
  for (const title of path) {
    chosen = items.find((item) => item.title === title);
    if (!chosen) {
      throw new Error(`No menu row is titled ${title}. Rows: ${items.map((item) => item.title).join(', ')}`);
    }
    items = chosen.items ?? [];
  }
  if (!chosen?.menuId || chosen.disabled) {
    throw new Error(`${path.join(' > ')} is not a menu action that can be chosen`);
  }
  await fireEvent(tabHeaderConfig(host), 'pressHeaderBarButtonMenuItem', { nativeEvent: { menuId: chosen.menuId } });
}

async function pressHeaderButton(tab: HostElement, name: string) {
  await fireEvent(tabHeaderConfig(tab), 'pressHeaderBarButtonItem', {
    nativeEvent: { buttonId: headerItem(tab, name).buttonId },
  });
}

export async function openSettings() {
  await pressHeaderButton(selectedTab(), 'Settings');
  return screen.findByRole('header', { name: 'Settings' });
}

export function queryAppleSignInButton() {
  const [button] = hostViews('ViewManagerAdapter_ExpoAppleAuthentication');
  return button ?? null;
}

export function appleSignInButton() {
  const button = queryAppleSignInButton();
  if (!button) {
    throw new Error('No Sign in with Apple button is on the screen');
  }
  return button;
}

export async function pressSignInWithApple() {
  await fireEvent(appleSignInButton(), 'buttonPress');
  await act(async () => {});
}

export function appearsBefore(
  first: ReturnType<typeof screen.getByRole>,
  second: ReturnType<typeof screen.getByRole>,
) {
  const hosts = screen.container.queryAll(() => true);
  return hosts.indexOf(first) < hosts.indexOf(second);
}

type HostElement = ReturnType<typeof screen.getByRole>;

const glassHost = 'ViewManagerAdapter_ExpoGlassEffect';

function isGlassView(element: HostElement) {
  return element.type === glassHost && 'glassEffectStyle' in element.props;
}

function isGlassGroup(element: HostElement) {
  return element.type === glassHost && 'spacing' in element.props;
}

function isTransparent(color: unknown) {
  return color === undefined || color === '#00000000';
}

export function backdropOf(element: HostElement) {
  let candidate: HostElement | null = element;
  while (candidate) {
    if (isGlassView(candidate) || !isTransparent(StyleSheet.flatten(candidate.props.style)?.backgroundColor)) {
      return candidate;
    }
    candidate = candidate.parent;
  }
  throw new Error('Nothing draws a background behind this element');
}

export function glassEffect(element: HostElement) {
  if (!isGlassView(element)) {
    return null;
  }
  const { glassEffectStyle, isInteractive = false, tintColor } = element.props;
  return { style: glassEffectStyle, interactive: isInteractive, tintColor };
}

export function glassGroupOf(element: HostElement) {
  const glass = backdropOf(element);
  return isGlassView(glass) && glass.parent && isGlassGroup(glass.parent) ? glass.parent : null;
}

export function cardImageUri(tile: HostElement) {
  const [image] = tile.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  if (!image) {
    throw new Error('No card image is in this tile');
  }
  return image.props.source?.[0]?.uri;
}

export function cardSheen(tile: HostElement) {
  const [sheen] = tile.queryAll((instance) => StyleSheet.flatten(instance.props.style)?.experimental_backgroundImage !== undefined);
  return sheen ? StyleSheet.flatten(sheen.props.style) : null;
}

export function imageTintColor(element: HostElement) {
  const [image] = element.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  if (!image) {
    throw new Error('No image is in this element');
  }
  return image.props.tintColor;
}

export function symbolTintColor(element: HostElement) {
  const [symbol] = element.queryAll((instance) => instance.type === 'ViewManagerAdapter_SymbolModule');
  if (!symbol) {
    throw new Error('No symbol is in this element');
  }
  return symbol.props.tintColor;
}

export function symbolNames(element: HostElement) {
  return element
    .queryAll((instance) => instance.type === 'ViewManagerAdapter_SymbolModule')
    .map((symbol) => symbol.props.name);
}

export function blocksColored(element: HostElement, color: string) {
  return element.queryAll((instance) => StyleSheet.flatten(instance.props.style)?.backgroundColor === color).length;
}

export function lineColoredBlocks(element: HostElement) {
  return blocksColored(element, tokenColors.line);
}

export function sideColumnWidths(element: HostElement) {
  let column = element;
  while (column.parent && StyleSheet.flatten(column.parent.props.style)?.flexDirection !== 'row') {
    column = column.parent;
  }
  const columns = (column.parent?.children ?? []).filter((child) => typeof child !== 'string') as HostElement[];
  const index = columns.indexOf(column);
  const widthOf = (side: HostElement | undefined) => StyleSheet.flatten(side?.props.style)?.width ?? null;
  return { start: widthOf(columns[index - 1]), end: widthOf(columns[index + 1]) };
}

export function placeholderColor(element: HostElement) {
  return element.props.placeholderTextColor;
}

export function cardImageOutline(tile: HostElement) {
  const [image] = tile.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  let frame = image?.parent ?? null;
  while (frame && frame !== tile.parent) {
    const { borderWidth, borderColor, borderRadius } = StyleSheet.flatten(frame.props.style) ?? {};
    if (borderWidth) {
      return { borderWidth, borderColor, borderRadius };
    }
    frame = frame.parent;
  }
  return null;
}

export async function scrollToEnd(tab: HostElement) {
  const [list] = tab.queryAll((instance) => instance.type === 'RCTScrollView');
  if (!list) {
    throw new Error('No scroll view is in this tab');
  }
  const viewport = { width: 400, height: 800 };
  const content = { width: 400, height: 10_000 };
  await fireEvent(list, 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...viewport } } });
  await fireEvent(list, 'contentSizeChange', content.width, content.height);
  const scrolledTo = (y: number) => ({
    nativeEvent: { contentOffset: { x: 0, y }, contentSize: content, layoutMeasurement: viewport },
  });
  const scrolledToEnd = scrolledTo(content.height - viewport.height);
  await fireEvent.scroll(list, scrolledTo(0));
  await fireEvent.scroll(list, scrolledToEnd);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await fireEvent.scroll(list, scrolledToEnd);
}

type Insets = { top?: number; bottom?: number; left?: number; right?: number };

export function touchTarget(element: HostElement) {
  const { minWidth, width, minHeight, height } = StyleSheet.flatten(element.props.style) ?? {};
  const slop: number | Insets = element.props.hitSlop ?? 0;
  const { top = 0, bottom = 0, left = 0, right = 0 } =
    typeof slop === 'number' ? { top: slop, bottom: slop, left: slop, right: slop } : slop;
  return {
    width: Number(width ?? minWidth ?? 0) + left + right,
    height: Number(height ?? minHeight ?? 0) + top + bottom,
  };
}

export function switchTrackColor(element: HostElement) {
  return element.props.onTintColor;
}

type TouchTrack = {
  touchActive: boolean;
  startPageX: number;
  startPageY: number;
  startTimeStamp: number;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
  previousTimeStamp: number;
};

function touchPath(target: HostElement) {
  const path: HostElement[] = [];
  let element: HostElement | null = target;
  while (element) {
    path.unshift(element);
    element = element.parent;
  }
  return path;
}

export async function touchDown(target: HostElement, { x, y }: { x: number; y: number }) {
  const path = touchPath(target);
  const track: TouchTrack = {
    touchActive: true,
    startPageX: x,
    startPageY: y,
    startTimeStamp: 0,
    currentPageX: x,
    currentPageY: y,
    currentTimeStamp: 0,
    previousPageX: x,
    previousPageY: y,
    previousTimeStamp: 0,
  };
  let responder: HostElement | undefined;
  const touchEvent = () => {
    const touch = { pageX: track.currentPageX, pageY: track.currentPageY, timestamp: track.currentTimeStamp };
    return {
      nativeEvent: { ...touch, touches: track.touchActive ? [touch] : [], changedTouches: [touch] },
      touchHistory: {
        numberActiveTouches: track.touchActive ? 1 : 0,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: track.currentTimeStamp,
        touchBank: [track],
      },
    };
  };
  const negotiate = async (phase: 'Start' | 'Move') => {
    await act(async () => {
      const event = touchEvent();
      responder =
        path.find((element) => element.props[`on${phase}ShouldSetResponderCapture`]?.(event)) ??
        [...path].reverse().find((element) => element.props[`on${phase}ShouldSetResponder`]?.(event));
      responder?.props.onResponderGrant?.(event);
    });
  };
  await negotiate('Start');
  return {
    async moveTo(position: { x?: number; y: number }) {
      track.previousPageX = track.currentPageX;
      track.previousPageY = track.currentPageY;
      track.previousTimeStamp = track.currentTimeStamp;
      track.currentPageX = position.x ?? track.currentPageX;
      track.currentPageY = position.y;
      track.currentTimeStamp += 16;
      if (!responder) {
        await negotiate('Move');
        return;
      }
      await act(async () => responder?.props.onResponderMove?.(touchEvent()));
    },
    async lift() {
      track.touchActive = false;
      track.currentTimeStamp += 16;
      await act(async () => responder?.props.onResponderRelease?.(touchEvent()));
    },
  };
}

export async function performAccessibilityAction(element: HostElement, label: string) {
  const actions: { name: string; label?: string }[] = element.props.accessibilityActions ?? [];
  const action = actions.find((candidate) => candidate.label === label);
  if (!action) {
    throw new Error(`No accessibility action is labelled ${label}. Actions: ${actions.map((candidate) => candidate.label).join(', ')}`);
  }
  await fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: action.name } });
}

export function accessibilityActionLabels(element: HostElement) {
  return (element.props.accessibilityActions ?? []).map((action: { label?: string }) => action.label);
}

let searchFieldText = '';

const searchBarCommands: { setText: (searchBar: unknown, text: string) => void } = jest.requireActual(
  'react-native-screens/lib/commonjs/fabric/SearchBarNativeComponent',
).Commands;

jest.spyOn(searchBarCommands, 'setText').mockImplementation((_searchBar, text) => {
  searchFieldText = text;
});

beforeEach(() => {
  searchFieldText = '';
});

function searchBarView(tab: HostElement) {
  const [searchBar] = tab.queryAll((instance) => instance.type === 'RNSSearchBar');
  if (!searchBar) {
    throw new Error('This tab has no search bar');
  }
  return searchBar;
}

export function shownSearchText() {
  return searchFieldText.replaceAll('\u200b', '');
}

export function tabSearchBar(tab: HostElement) {
  const { placeholder, placement, hideWhenScrolling } = searchBarView(tab).props;
  return { placeholder, placement, hidesWhenScrolling: hideWhenScrolling };
}

async function changeSearchText(text: string) {
  searchFieldText = text;
  await fireEvent(searchBarView(selectedTab()), 'changeText', { nativeEvent: { text } });
}

async function pauseTyping() {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

export async function typeInSearchBar(text: string) {
  await fireEvent(searchBarView(selectedTab()), 'searchFocus', { nativeEvent: {} });
  for (const character of text) {
    await changeSearchText(searchFieldText + character);
  }
  await pauseTyping();
}

export async function pressBackspaceInSearchBar() {
  if (searchFieldText !== '') {
    await changeSearchText(searchFieldText.slice(0, -1));
    await pauseTyping();
  }
}

export async function pressSearchKey() {
  await fireEvent(searchBarView(selectedTab()), 'searchButtonPress', { nativeEvent: { text: searchFieldText } });
}

export async function pressSearchCancel() {
  searchFieldText = '';
  await fireEvent(searchBarView(selectedTab()), 'cancelButtonPress', { nativeEvent: {} });
}
