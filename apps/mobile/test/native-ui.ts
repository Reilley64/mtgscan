import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { Alert, ScrollView, StyleSheet, type AlertButton } from 'react-native';

import { nativeStateValue, setNativeStateValue } from './fake-native-state';
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

export function tabBadge(label: string): string | undefined {
  return tabScreen((props) => props.title === label, `is labelled ${label}`).props.badgeValue;
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

export function presentedPageSheet() {
  const sheet = hostViews('RNSModalScreen').find((candidate) => candidate.props.stackPresentation === 'pageSheet');
  if (!sheet) {
    throw new Error('No page sheet is presented');
  }
  return sheet;
}

export function isPageSheetPresented() {
  return hostViews('RNSModalScreen').some((candidate) => candidate.props.stackPresentation === 'pageSheet');
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

function nearestStack(element: HostElement) {
  let parent = element.parent;
  while (parent && parent.type !== 'RNSScreenStack') {
    parent = parent.parent;
  }
  return parent;
}

function rootStackScreens() {
  const [rootStack] = hostViews('RNSScreenStack');
  if (!rootStack) {
    throw new Error('No stack is on the screen');
  }
  return rootStack.queryAll((instance) => instance.type === 'RNSScreen' && nearestStack(instance) === rootStack);
}

export function pushedScreen() {
  const screens = rootStackScreens();
  if (screens.length < 2) {
    throw new Error('No screen is pushed');
  }
  return screens.at(-1)!;
}

export function pushedScreenBackButton() {
  const [header] = pushedScreen().queryAll((instance) => instance.type === 'RNSScreenStackHeaderConfig');
  if (!header || header.props.hidden || header.props.hideBackButton) {
    return null;
  }
  return { label: header.props.backTitle as string | undefined };
}

export async function swipeBackFromThePushedScreen() {
  const current = pushedScreen();
  if (current.props.gestureEnabled === false) {
    throw new Error('This screen does not go back with a swipe from the left edge');
  }
  await fireEvent(current, 'dismissed', { nativeEvent: { dismissCount: 1 } });
}

const answeredAlerts = new WeakSet<unknown[]>();

function openAlert() {
  const call = jest.mocked(Alert.alert).mock.lastCall;
  return call && !answeredAlerts.has(call) ? call : null;
}

function alertButtons(call: Parameters<typeof Alert.alert>): AlertButton[] {
  return call[2] ?? [{ text: 'OK' }];
}

function openAlertDetails() {
  const call = openAlert();
  return call ? { title: call[0], message: call[1], buttons: alertButtons(call) } : null;
}

export function presentedAlert() {
  const alert = openAlertDetails();
  return alert ? { ...alert, buttons: alert.buttons.map((button) => button.text) } : null;
}

export function presentedAlertButtonStyles() {
  return openAlertDetails()?.buttons.map(({ text, style = 'default' }) => ({ text, style })) ?? null;
}

export async function pressAlertButton(label: string) {
  const call = openAlert();
  const button = call && alertButtons(call).find((candidate) => candidate.text === label);
  if (!call || !button) {
    throw new Error(`No alert button is labelled ${label}`);
  }
  answeredAlerts.add(call);
  await act(async () => button.onPress?.());
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
  tintColor?: unknown;
  disabled?: boolean;
  menu?: { title: string; items: HeaderMenuItem[] };
  badge?: { value: string; style: { backgroundColor: unknown } };
};

type HeaderMenuItem = {
  title: string;
  subtitle?: string;
  sfSymbolName?: string;
  disabled?: boolean;
  destructive?: boolean;
  state?: 'on' | 'off';
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

function rightHeaderItems(tab: HostElement): HeaderItem[] {
  return [...(tabHeaderConfig(tab).props.headerRightBarButtonItems ?? [])].reverse();
}

function leftHeaderItems(tab: HostElement): HeaderItem[] {
  return tabHeaderConfig(tab).props.headerLeftBarButtonItems ?? [];
}

function headerItemName(item: HeaderItem) {
  return item.accessibilityLabel ?? item.title;
}

export function leftHeaderButtons(tab: HostElement) {
  return leftHeaderItems(tab).map(headerItemName);
}

function headerItem(tab: HostElement, name: string) {
  const item = [...leftHeaderItems(tab), ...rightHeaderItems(tab)].find((candidate) => headerItemName(candidate) === name);
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
    buttons: rightHeaderItems(tab).map(headerItemName),
  };
}

export function headerTitles() {
  return shownHeaderConfigs(screen.container).map((config) => config.props.title);
}

export function headerButtonBadge(tab: HostElement, name: string) {
  const { badge } = headerItem(tab, name);
  return badge ? { count: badge.value, color: badge.style.backgroundColor } : null;
}

export function headerButtonColor(tab: HostElement, name: string) {
  return headerItem(tab, name).tintColor;
}

export function presentedDrawerContent() {
  return presentedDrawerView().view;
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
  return {
    title,
    items: items.map(({ title: itemTitle, subtitle, sfSymbolName }) => ({ title: itemTitle, subtitle, symbol: sfSymbolName })),
  };
}

export function pressableMenuRows(tab: HostElement, name: string) {
  return menuOf(tab, name)
    .items.filter((item) => !item.disabled)
    .map((item) => item.title);
}

export function headerButtonIsDisabled(host: HostElement, name: string) {
  return headerItem(host, name).disabled ?? false;
}

type MenuRow = { title: string; destructive: boolean; checked?: true; rows?: MenuRow[] };

function menuRows(items: HeaderMenuItem[]): MenuRow[] {
  return items.map((item) => ({
    title: item.title,
    destructive: item.destructive ?? false,
    ...(item.state === 'on' ? { checked: true } : {}),
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

export async function pressHeaderButton(tab: HostElement, name: string) {
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

export function imageFrames(element: HostElement) {
  return element
    .queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage')
    .map((image) => ({ uri: image.props.source?.[0]?.uri, width: StyleSheet.flatten(image.parent?.props.style)?.width }));
}

export function imageSources(element: HostElement) {
  return element
    .queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage')
    .map((image) => image.props.source?.[0]?.uri ?? image.props.source?.[0]?.testUri);
}

export function cardSheen(tile: HostElement) {
  const [sheen] = tile.queryAll((instance) => StyleSheet.flatten(instance.props.style)?.experimental_backgroundImage !== undefined);
  return sheen ? StyleSheet.flatten(sheen.props.style) : null;
}

export function blurredImageUris() {
  return hostViews('ViewManagerAdapter_ExpoImage')
    .filter((image) => image.props.blurRadius > 0)
    .map((image) => image.props.source?.[0]?.uri);
}

export function imageTintColor(element: HostElement) {
  const [image] = element.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  if (!image) {
    throw new Error('No image is in this element');
  }
  return image.props.tintColor;
}

export function symbolTintColor(element: HostElement) {
  return symbolIn(element).props.tintColor;
}

function isSymbol(instance: HostElement) {
  return instance.type === 'ViewManagerAdapter_SymbolModule';
}

export function symbolIn(element: HostElement) {
  const [symbol] = element.queryAll(isSymbol);
  if (!symbol) {
    throw new Error('No symbol is in this element');
  }
  return symbol;
}

export function symbolTintColors(element: HostElement) {
  return element.queryAll(isSymbol).map((symbol) => symbol.props.tintColor);
}

export function symbolSizes(element: HostElement) {
  return element.queryAll(isSymbol).map((symbol) => symbol.props.size);
}

export function symbolNamed(element: HostElement, name: string) {
  const symbol = element.queryAll(isSymbol).find((candidate) => candidate.props.name === name);
  if (!symbol) {
    throw new Error(`No ${name} symbol is in this element`);
  }
  return symbol;
}

export function symbolNames(element: HostElement) {
  return element.queryAll(isSymbol).map((symbol) => symbol.props.name);
}

function rgbaOf(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, 1)`;
}

export function splitColorsBehind(glyph: HostElement) {
  let candidate = glyph.parent;
  while (candidate) {
    const gradient = StyleSheet.flatten(candidate.props.style)?.experimental_backgroundImage;
    if (gradient !== undefined) {
      return [...new Set(String(gradient).match(/#[0-9a-f]{6}/g))].map(rgbaOf);
    }
    candidate = candidate.parent;
  }
  return [];
}

function sizesAround(element: HostElement, dimension: 'width' | 'height' | 'minHeight') {
  const sizes: number[] = [];
  for (let candidate = element.parent; candidate; candidate = candidate.parent) {
    const size = StyleSheet.flatten(candidate.props.style)?.[dimension];
    if (typeof size === 'number') {
      sizes.push(size);
    }
  }
  return sizes;
}

export function widthsAround(element: HostElement) {
  return sizesAround(element, 'width');
}

export function heightsAround(element: HostElement) {
  return sizesAround(element, 'height');
}

export function minHeightsAround(element: HostElement) {
  return sizesAround(element, 'minHeight');
}

function isScrollContent(element: HostElement) {
  return element.parent?.type === 'RCTScrollView';
}

function isListCell(element: HostElement) {
  return element.parent !== null && isScrollContent(element.parent) && typeof element.props.onLayout === 'function';
}

function firstBlockIn(element: HostElement) {
  return element.children.find((child) => typeof child !== 'string');
}

export function placeInScrollView(element: HostElement) {
  let block = element;
  while (block.parent && !isScrollContent(block.parent) && !isListCell(block.parent)) {
    block = block.parent;
  }
  const container = block.parent;
  if (!container) {
    throw new Error('This element is not in a scroll view');
  }
  const content = isListCell(container) ? container.parent! : container;
  const { padding = 0, paddingHorizontal = padding, paddingVertical = padding, paddingTop = paddingVertical, paddingLeft = paddingHorizontal, paddingRight = paddingHorizontal } =
    StyleSheet.flatten(content.props.style) ?? {};
  const isFirst = firstBlockIn(container) === block && (container === content || firstBlockIn(content) === container);
  return { block, isFirst, contentInsets: { top: paddingTop, left: paddingLeft, right: paddingRight } };
}

export function blocksColored(element: HostElement, color: string) {
  return element.queryAll((instance) => StyleSheet.flatten(instance.props.style)?.backgroundColor === color).length;
}

export function dashedOutlinesColored(element: HostElement, color: string) {
  return element.queryAll((instance) => {
    const style = StyleSheet.flatten(instance.props.style);
    return style?.borderStyle === 'dashed' && style.borderColor === color;
  }).length;
}

export function fadesDown(element: HostElement) {
  return element.queryAll((instance) =>
    String(StyleSheet.flatten(instance.props.style)?.experimental_backgroundImage).startsWith('linear-gradient(180deg'),
  ).length > 0;
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

const expoUiHost = 'ViewManagerAdapter_ExpoUI';

function isNativeMenu(element: HostElement) {
  return element.type === expoUiHost && 'hasPrimaryAction' in element.props;
}

function spokenLabelOf(element: HostElement): string | undefined {
  const modifiers: { $type: string; label?: string }[] = element.props.modifiers ?? [];
  return modifiers.find((modifier) => modifier.$type === 'accessibilityLabel')?.label;
}

export function contextMenu(element: HostElement) {
  for (let parent = element.parent; parent; parent = parent.parent) {
    const items = parent.children.find((child) => typeof child !== 'string' && child.type === expoUiHost && child.props.name === 'items');
    if (items && typeof items !== 'string') {
      return items;
    }
  }
  throw new Error('This element has no context menu');
}

function isSwiftUiHost(element: HostElement) {
  return element.type === expoUiHost && 'matchContentsVertical' in element.props;
}

export function movesWithSafeArea(element: HostElement) {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (isSwiftUiHost(parent)) {
      return parent.props.ignoreSafeArea !== 'all';
    }
  }
  throw new Error('This element is not drawn by SwiftUI');
}

export function menuButtonNames(host: HostElement) {
  return host.queryAll(isNativeMenu).map(spokenLabelOf);
}

export function menuButton(host: HostElement, name: string) {
  const button = host.queryAll(isNativeMenu).find((candidate) => spokenLabelOf(candidate) === name);
  if (!button) {
    throw new Error(`No menu button is named ${name}. Menu buttons: ${menuButtonNames(host).join(', ')}`);
  }
  return button;
}

function menuChoices(button: HostElement) {
  return button.queryAll((instance) => instance.type === expoUiHost && 'isOn' in instance.props);
}

function menuActions(button: HostElement) {
  return button.queryAll((instance) => instance.type === expoUiHost && 'onButtonPress' in instance.props);
}

export function buttonMenuActions(button: HostElement) {
  return menuActions(button).map((action) => ({
    title: action.props.label as string,
    destructive: action.props.role === 'destructive',
  }));
}

export async function pressButtonMenuAction(button: HostElement, title: string) {
  const action = menuActions(button).find((candidate) => candidate.props.label === title);
  if (!action) {
    throw new Error(`No menu action is titled ${title}. Actions: ${buttonMenuActions(button).map((item) => item.title).join(', ')}`);
  }
  await fireEvent(action, 'buttonPress');
}

export function buttonMenu(button: HostElement) {
  const [section] = button.queryAll((instance) => instance.type === expoUiHost && 'title' in instance.props);
  return {
    title: section?.props.title as string | undefined,
    items: menuChoices(button).map((choice) => ({
      title: choice.props.label as string,
      checked: Boolean(choice.props.isOn),
      symbol: choice.props.systemImage as string | undefined,
    })),
  };
}

export async function pressButtonMenuItem(button: HostElement, title: string) {
  const choice = menuChoices(button).find((candidate) => candidate.props.label === title);
  if (!choice) {
    throw new Error(`No menu row is titled ${title}. Rows: ${buttonMenu(button).items.map((item) => item.title).join(', ')}`);
  }
  await fireEvent(choice, 'isOnChange', { nativeEvent: { isOn: !choice.props.isOn } });
}

let searchFieldText = '';

let focusedSearchBar: HostElement | null = null;

const searchBarCommands: {
  setText: (searchBar: unknown, text: string) => void;
  blur: (searchBar: unknown) => void;
  focus: (searchBar: unknown) => void;
} = jest.requireActual('react-native-screens/lib/commonjs/fabric/SearchBarNativeComponent').Commands;

jest.spyOn(searchBarCommands, 'setText').mockImplementation((_searchBar, text) => {
  searchFieldText = text;
});

jest.spyOn(searchBarCommands, 'focus').mockImplementation((searchBar) => {
  const { onSearchFocus } = (searchBar as { props: { onSearchFocus?: unknown } }).props;
  focusedSearchBar = hostViews('RNSSearchBar').find((candidate) => candidate.props.onSearchFocus === onSearchFocus) ?? null;
  focusedSearchBar?.props.onSearchFocus?.({ nativeEvent: {} });
});

jest.spyOn(searchBarCommands, 'blur').mockImplementation(() => {
  const searchBar = focusedSearchBar;
  focusedSearchBar = null;
  searchBar?.props.onSearchBlur?.({ nativeEvent: {} });
});

beforeEach(() => {
  searchFieldText = '';
  focusedSearchBar = null;
});

function searchBarView(tab: HostElement) {
  const [searchBar] = tab.queryAll((instance) => instance.type === 'RNSSearchBar');
  if (!searchBar) {
    throw new Error('This tab has no search bar');
  }
  return searchBar;
}

export function searchBarHasFocus() {
  return focusedSearchBar !== null;
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
  focusedSearchBar = searchBarView(selectedTab());
  await fireEvent(focusedSearchBar, 'searchFocus', { nativeEvent: {} });
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

function isAlertWithField(instance: HostElement) {
  return instance.type === expoUiHost && 'isPresented' in instance.props;
}

function presentedFieldAlert() {
  return hostViews(expoUiHost).find((candidate) => isAlertWithField(candidate) && candidate.props.isPresented) ?? null;
}

function slotOf(alert: HostElement, name: string) {
  const [slot] = alert.queryAll((instance) => instance.type === expoUiHost && instance.props.name === name);
  return slot;
}

function alertField(alert: HostElement) {
  const [field] = slotOf(alert, 'actions').queryAll((instance) => instance.type === expoUiHost && 'placeholder' in instance.props);
  return field;
}

function alertActions(alert: HostElement) {
  return slotOf(alert, 'actions').queryAll((instance) => instance.type === expoUiHost && 'onButtonPress' in instance.props);
}

function isTurnedOff(button: HostElement) {
  const modifiers: { $type: string; disabled?: boolean }[] = button.props.modifiers ?? [];
  return modifiers.some((modifier) => modifier.$type === 'disabled' && modifier.disabled);
}

export function presentedAlertWithField() {
  const alert = presentedFieldAlert();
  if (!alert) {
    return null;
  }
  const [message] = slotOf(alert, 'message').queryAll((instance) => instance.type === expoUiHost && 'text' in instance.props);
  const field = alertField(alert);
  return {
    title: alert.props.title as string,
    message: message?.props.text as string | undefined,
    field: {
      placeholder: field.props.placeholder as string,
      maxLength: field.props.maxLength as number,
      text: (nativeStateValue(field.props.text) ?? '') as string,
    },
    buttons: alertActions(alert).map((button) => ({ label: button.props.label as string, enabled: !isTurnedOff(button) })),
  };
}

function openAlertWithField() {
  const alert = presentedFieldAlert();
  if (!alert) {
    throw new Error('No alert with a text field is open');
  }
  return alert;
}

export async function typeInAlertField(text: string) {
  const field = alertField(openAlertWithField());
  setNativeStateValue(field.props.text, text);
  await fireEvent(field, 'textChange', { nativeEvent: { value: text } });
}

export async function pressAlertWithFieldButton(label: string) {
  const alert = openAlertWithField();
  const button = alertActions(alert).find((candidate) => candidate.props.label === label);
  if (!button) {
    throw new Error(`No alert button is labelled ${label}`);
  }
  if (isTurnedOff(button)) {
    throw new Error(`The alert button ${label} is off`);
  }
  await fireEvent(button, 'buttonPress');
  await fireEvent(alert, 'isPresentedChange', { nativeEvent: { isPresented: false } });
}
