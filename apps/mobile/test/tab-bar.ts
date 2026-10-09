import { fireEvent, screen } from 'expo-router/testing-library';

function tabBar() {
  const [host] = screen.container.queryAll((instance) => instance.type === 'RNSTabsHostIOS');
  return host;
}

function nativeTabs() {
  return screen.container.queryAll((instance) => instance.type === 'RNSTabsScreenIOS');
}

export function tabBarLabels(): string[] {
  return nativeTabs().map((tab) => tab.props.title);
}

export function selectedTab() {
  const { selectedScreenKey } = tabBar().props.navStateRequest;
  const tab = nativeTabs().find((candidate) => candidate.props.screenKey === selectedScreenKey);
  if (!tab) {
    throw new Error('No tab is selected');
  }
  return tab;
}

export async function pressTab(label: string) {
  const tab = nativeTabs().find((candidate) => candidate.props.title === label);
  if (!tab) {
    throw new Error(`No tab labelled ${label}. Tabs: ${tabBarLabels().join(', ')}`);
  }
  await fireEvent(tabBar(), 'tabSelected', {
    nativeEvent: { selectedScreenKey: tab.props.screenKey, provenance: 0, actionOrigin: 'user' },
  });
}
