import { act, fireEvent, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';

import { leaveTheApp, returnToTheApp } from './app-state';
import { lightningBoltM10 } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre } from './fake-card-recognizer';
import { isScreenKeptAwake } from './fake-keep-awake';
import { startSignedIn } from './fake-supabase';
import { pressDrawerBack, pressTab, swipeDownDrawer } from './native-ui';
import { renderApp } from './render-app';
import { openLatestScan, openScan, scanACard, scanTab } from './scanning';

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
  nextPhotosAre(cardRecognition([lightningBoltM10]));
});

test('the screen stays on only while the Scan tab is open', async () => {
  await renderApp();
  expect(isScreenKeptAwake()).toBe(false);

  await pressTab('Scan');
  expect(isScreenKeptAwake()).toBe(true);

  await pressTab('Collection');
  expect(isScreenKeptAwake()).toBe(false);
});

test('batch review and the scan details in it keep the screen on', async () => {
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'Scan batch, 1' }));
  await screen.findByText('Add to collection');
  expect(isScreenKeptAwake()).toBe(true);

  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' }));
  await screen.findByRole('button', { name: 'Remove scan' });
  expect(isScreenKeptAwake()).toBe(true);

  await pressDrawerBack();
  expect(isScreenKeptAwake()).toBe(true);
});

test('the pickers opened from the latest-scan chip keep the screen on', async () => {
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'NM' }));
  await screen.findByRole('button', { name: 'LP' });
  expect(isScreenKeptAwake()).toBe(true);
});

test('the scan details drawer opened from the latest-scan chip keeps the screen on', async () => {
  await openScan();
  await scanACard();

  await openLatestScan(/^Lightning Bolt/);
  await screen.findByRole('button', { name: 'Remove scan' });
  expect(isScreenKeptAwake()).toBe(true);

  await swipeDownDrawer();
  expect(isScreenKeptAwake()).toBe(true);
});

test('a link that opens settings over the Scan tab lets the phone auto-lock', async () => {
  await openScan();

  await act(async () => router.push('/settings'));
  await screen.findByRole('header', { name: 'Settings' });
  expect(isScreenKeptAwake()).toBe(false);

  await swipeDownDrawer();
  expect(isScreenKeptAwake()).toBe(true);
});

test('sending the app to the background lets the phone auto-lock, and coming back to the Scan tab keeps the screen on again', async () => {
  await openScan();

  await leaveTheApp();
  expect(isScreenKeptAwake()).toBe(false);

  await returnToTheApp();
  expect(isScreenKeptAwake()).toBe(true);
});
