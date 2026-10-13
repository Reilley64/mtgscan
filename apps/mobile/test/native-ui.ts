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
  const [drawer] = hostViews('RNSModalScreen').filter(
    (candidate) => candidate.props.stackPresentation === 'formSheet',
  );
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

function presentedPageSheetView() {
  const [sheet] = hostViews('RNSModalScreen').filter((candidate) => candidate.props.stackPresentation === 'pageSheet');
  if (!sheet) {
    throw new Error('No page sheet is open');
  }
  return sheet;
}

export function isPageSheetPresented() {
  return hostViews('RNSModalScreen').some((candidate) => candidate.props.stackPresentation === 'pageSheet');
}

export async function swipeDownPageSheet() {
  await fireEvent(presentedPageSheetView(), 'dismissed', { nativeEvent: { dismissCount: 1 } });
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

export async function openSettings() {
  await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'Settings' }));
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

export function cardImageUri(tile: HostElement) {
  const [image] = tile.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  if (!image) {
    throw new Error('No card image is in this tile');
  }
  return image.props.source?.[0]?.uri;
}

export function imageTintColor(element: HostElement) {
  const [image] = element.queryAll((instance) => instance.type === 'ViewManagerAdapter_ExpoImage');
  if (!image) {
    throw new Error('No image is in this element');
  }
  return image.props.tintColor;
}

export function lineColoredBlocks(element: HostElement) {
  return element.queryAll((instance) => StyleSheet.flatten(instance.props.style)?.backgroundColor === tokenColors.line)
    .length;
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
