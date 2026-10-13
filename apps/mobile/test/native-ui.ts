import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

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
  if (drawer.largestUndimmedIndex >= drawer.openingIndex) {
    throw new Error('The screen behind this drawer is not dimmed, so a tap there does not close it');
  }
  await closeDrawerByGesture(drawer);
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
  menu?: { title: string; items: { title: string; subtitle?: string }[] };
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

export function headerMenu(tab: HostElement, name: string) {
  const { menu } = headerItem(tab, name);
  if (!menu) {
    throw new Error(`The header button ${name} has no menu`);
  }
  return { title: menu.title, items: menu.items.map(({ title, subtitle }) => ({ title, subtitle })) };
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
  const scrolledToEnd = {
    nativeEvent: {
      contentOffset: { x: 0, y: content.height - viewport.height },
      contentSize: content,
      layoutMeasurement: viewport,
    },
  };
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
