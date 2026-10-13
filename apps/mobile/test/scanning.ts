import { fireEvent, screen, within } from 'expo-router/testing-library';

import { card, emptySurface, repeat, scan } from './detection-samples';
import { pressTab, selectedTab } from './native-ui';
import { renderApp } from './render-app';

export async function openScan() {
  await renderApp();
  await pressTab('Scan');
}

export async function scanACard() {
  await scan([...repeat(4, card), ...repeat(6, emptySurface)]);
}

export function scanTab() {
  return within(selectedTab());
}

export function latestScanChip(name: string | RegExp) {
  return scanTab().getByRole('button', { name });
}

export async function openLatestScan(name: string | RegExp) {
  await fireEvent.press(latestScanChip(name));
}

export function selectedChoice(name: string) {
  return screen.getByRole('button', { name, selected: true });
}
