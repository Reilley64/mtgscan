import { fireEvent, screen, within } from 'expo-router/testing-library';

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

export async function swipeDownPageSheet() {
  const [sheet] = hostViews('RNSModalScreen').filter(
    (candidate) => candidate.props.stackPresentation === 'pageSheet',
  );
  if (!sheet) {
    throw new Error('No page sheet is open');
  }
  await fireEvent(sheet, 'dismissed', { nativeEvent: { dismissCount: 1 } });
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
