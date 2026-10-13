import { act, fireEvent, screen } from 'expo-router/testing-library';

import { lightningBoltM10, shock } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cameraIsOn, phoneHasNoCamera } from './fake-card-detector';
import { cardRecognition, holdNextRecognition, nextPhotosAre } from './fake-card-recognizer';
import { scanFeedback } from './fake-scan-feedback';
import {
  failNextScanBatchCommit,
  holdNextScanBatchCommit,
  scanBatchesSentToTheServer,
  startSignedIn,
} from './fake-supabase';
import { accessibilityActionLabels, performAccessibilityAction, pressTab, selectedTab } from './native-ui';
import { openScan, scanACard, scanTab, startPullingDown } from './scanning';

async function pressPlusOne() {
  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
}

async function scanTwoCopies() {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await pressPlusOne();
}

async function waitForTheIndicatorToSlideAway() {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

function expectNoIndicator() {
  expect(scanTab().queryByText(/to add|Nothing to add|Adding/)).not.toBeOnTheScreen();
}

function expectAnEmptyChip() {
  expect(selectedTab()).toHaveTextContent('Finish+1', { exact: true });
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

test('pulling down shows the cards to add, and past the threshold asks to release with a light haptic', async () => {
  await scanTwoCopies();
  const feedbackBeforePull = scanFeedback().length;

  const pull = await startPullingDown();
  await pull.pullTo(60);

  expect(scanTab().getByText('Pull to add 2 cards')).toBeOnTheScreen();
  expect(scanFeedback().slice(feedbackBeforePull)).toEqual([]);

  await pull.pullTo(140);

  expect(scanTab().getByText('Release to add 2 cards')).toBeOnTheScreen();
  expect(scanFeedback().slice(feedbackBeforePull)).toEqual(['light impact']);
  expect(cameraIsOn()).toBe(true);
});

test('releasing past the threshold adds the scan batch through the batch commit and leaves the chip empty', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await scanACard();

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.release();
  await waitForTheIndicatorToSlideAway();

  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map(({ card_printing_id, copy_ids }) => ({ card_printing_id, copies: copy_ids.length }))).toEqual([
    { card_printing_id: lightningBoltM10.printingId, copies: 2 },
    { card_printing_id: shock.printingId, copies: 1 },
  ]);
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  expectAnEmptyChip();
  expectNoIndicator();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(2);
});

test('the indicator says it is adding the cards while the commit runs', async () => {
  await scanTwoCopies();
  const commit = holdNextScanBatchCommit();

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.release();

  expect(scanTab().getByText('Adding 2 cards')).toBeOnTheScreen();
  await commit.finish();
  await waitForTheIndicatorToSlideAway();
  expectNoIndicator();
});

test('releasing before the threshold adds nothing and the indicator slides away', async () => {
  await scanTwoCopies();

  const pull = await startPullingDown();
  await pull.pullTo(100);
  await pull.release();
  await waitForTheIndicatorToSlideAway();

  expect(scanBatchesSentToTheServer()).toEqual([]);
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
  expectNoIndicator();
});

test('swiping back up before releasing cancels the add', async () => {
  await scanTwoCopies();

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.pullTo(40);

  expect(scanTab().getByText('Pull to add 2 cards')).toBeOnTheScreen();
  await pull.release();
  await waitForTheIndicatorToSlideAway();
  expect(scanBatchesSentToTheServer()).toEqual([]);
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
  expectNoIndicator();
});

test('with no recognized copies the indicator says there is nothing to add, and releasing adds nothing', async () => {
  nextPhotosAre('unreadable_photo');
  await openScan();
  await scanACard();
  const feedbackBeforePull = scanFeedback().length;

  const pull = await startPullingDown();
  await pull.pullTo(60);
  expect(scanTab().getByText('Nothing to add')).toBeOnTheScreen();
  await pull.pullTo(140);
  expect(scanTab().getByText('Nothing to add')).toBeOnTheScreen();
  await pull.release();
  await waitForTheIndicatorToSlideAway();

  expect(scanFeedback().slice(feedbackBeforePull)).toEqual([]);
  expect(scanBatchesSentToTheServer()).toEqual([]);
});

test('a failed add shows a short failure notice and keeps the scan batch', async () => {
  await scanTwoCopies();
  failNextScanBatchCommit('before the server adds it');

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.release();

  expect(scanTab().getByRole('alert', { name: 'Could not add to your collection. Your scans are kept.' })).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
  expectNoIndicator();
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
  expect(scanTab().queryByRole('alert')).not.toBeOnTheScreen();
});

test('a pull that starts at the top of the screen does nothing, so it leaves room for Notification Center', async () => {
  await scanTwoCopies();

  const pull = await startPullingDown({ from: 20 });
  await pull.pullTo(140);
  await pull.release();

  expectNoIndicator();
  expect(scanBatchesSentToTheServer()).toEqual([]);
});

test('a pull while a card is being recognized does nothing', async () => {
  await scanTwoCopies();
  holdNextRecognition();
  await scanACard();

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.release();

  expectNoIndicator();
  expect(scanBatchesSentToTheServer()).toEqual([]);
});

test('releasing past the threshold adds nothing when a card started to be recognized during the pull', async () => {
  await scanTwoCopies();
  const pull = await startPullingDown();
  await pull.pullTo(140);

  holdNextRecognition();
  await scanACard();
  await pull.release();

  expect(scanBatchesSentToTheServer()).toEqual([]);
});

test('a pull adds nothing and the VoiceOver action is gone while an add is still running', async () => {
  await scanTwoCopies();
  const commit = holdNextScanBatchCommit();
  await performAccessibilityAction(scanTab().getByRole('button', { name: 'Scan batch, 2' }), 'Add 2 cards to collection');

  const pull = await startPullingDown();
  await pull.pullTo(140);
  await pull.release();

  expect(scanBatchesSentToTheServer()).toHaveLength(1);
  expect(accessibilityActionLabels(scanTab().getByRole('button', { name: 'Scan batch, 2' }))).toEqual([]);
  await commit.finish();
});

test('the pull also works over the Camera not available message', async () => {
  phoneHasNoCamera();
  await openScan();

  const pull = await startPullingDown();
  await pull.pullTo(60);

  expect(scanTab().getByText('Camera not available')).toBeOnTheScreen();
  expect(scanTab().getByText('Nothing to add')).toBeOnTheScreen();
});

test('VoiceOver offers the add as an action on the batch button', async () => {
  await scanTwoCopies();
  const batchButton = scanTab().getByRole('button', { name: 'Scan batch, 2' });

  await performAccessibilityAction(batchButton, 'Add 2 cards to collection');

  expect(scanBatchesSentToTheServer()).toHaveLength(1);
  expect(accessibilityActionLabels(scanTab().getByRole('button', { name: 'Scan batch' }))).toEqual([]);
});
