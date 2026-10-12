import { act, fireEvent, screen, within } from 'expo-router/testing-library';

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

function presentedSheet() {
  const [sheet] = hostViews('RNSModalScreen').filter((candidate) =>
    ['formSheet', 'pageSheet'].includes(candidate.props.stackPresentation),
  );
  if (!sheet) {
    throw new Error('No sheet is open');
  }
  return sheet;
}

export function openSheet() {
  const { stackPresentation, sheetGrabberVisible, sheetAllowedDetents, sheetInitialDetent } =
    presentedSheet().props;
  const heights: number[] = stackPresentation === 'formSheet' ? sheetAllowedDetents : [1];
  return {
    showsGrabber: sheetGrabberVisible === true,
    heights,
    openingHeight: heights[sheetInitialDetent ?? 0],
  };
}

async function dismissSheet(sheet: ReturnType<typeof presentedSheet>) {
  if (sheet.props.gestureEnabled === false) {
    throw new Error('This sheet does not close by gesture');
  }
  await fireEvent(sheet, 'dismissed', { nativeEvent: { dismissCount: 1 } });
}

export async function swipeDownSheet() {
  await dismissSheet(presentedSheet());
}

export async function tapOutsideSheet() {
  const sheet = presentedSheet();
  const { sheetLargestUndimmedDetent = -1, sheetInitialDetent = 0 } = sheet.props;
  if (sheetLargestUndimmedDetent >= sheetInitialDetent) {
    throw new Error('The screen behind this sheet is not dimmed, so a tap there does not close it');
  }
  await dismissSheet(sheet);
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
