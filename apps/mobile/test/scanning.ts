import { fireEvent, screen, within } from 'expo-router/testing-library';

import { card, emptySurface, repeat, scan } from './detection-samples';
import { pressTab, selectedTab, touchDown } from './native-ui';
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

export async function startPullingDown({ from = 300 }: { from?: number } = {}) {
  const finger = await touchDown(scanTab().getByLabelText('Camera'), { x: 200, y: from });
  const grabbedAt = from + 20;
  await finger.moveTo({ y: grabbedAt });
  return {
    pullTo: (distance: number) => finger.moveTo({ y: grabbedAt + distance }),
    release: finger.lift,
  };
}

export const quickActionsOfAnEmptyChip = ['Nonfoil', 'NM', 'Set', 'EN', '+1'];

export function expectDisabledQuickActions() {
  quickActionsOfAnEmptyChip.forEach((name) => expect(scanTab().getByRole('button', { name })).toBeDisabled());
}
