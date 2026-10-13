import { act, fireEvent, screen } from 'expo-router/testing-library';

import { lightningBolt2xm, lightningBoltM10, shock } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre } from './fake-card-recognizer';
import {
  failNextScanBatchCommit,
  holdNextScanBatchCommit,
  scanBatchesSentToTheServer,
  signInNextWithEmail,
  startSignedIn,
} from './fake-supabase';
import { isDrawerPresented, openSettings, presentedDrawer, pressTab, swipeDownDrawer } from './native-ui';
import { restartTheApp } from './render-app';
import { latestScanChip, openLatestScan, openScan, scanACard, scanTab, selectedChoice } from './scanning';

async function openBatchReview(count?: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: count ? `Scan batch, ${count}` : 'Scan batch' }));
  return screen.findByRole('header', { name: 'Scan batch' });
}

function reviewRows() {
  return screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string | undefined)
    .filter((label) => label?.includes(' · '));
}

async function addToCollection(copies: number) {
  await fireEvent.press(screen.getByRole('button', { name: `Add ${copies} to collection` }));
}

async function pressPlusOne() {
  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

test('the batch button counts the copies to add and leaves out scans that were not recognized', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();

  await scanACard();
  await pressPlusOne();
  await scanACard();

  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
  expect(scanTab().getByText('2')).toBeOnTheScreen();
  await openBatchReview(2);
  expect(screen.getByRole('button', { name: 'Not recognized, Tap to search' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add 2 to collection' })).toBeOnTheScreen();
});

test('the batch button opens batch review as a bottom drawer at half height that drags to full height', async () => {
  await openScan();

  await openBatchReview();

  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
  expect(screen.getByRole('button', { name: 'Add 0 to collection' })).toBeDisabled();
  await swipeDownDrawer();
  expect(isDrawerPresented()).toBe(false);
});

test('batch review lists every copy as its own row with no merging and no +/- control', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  await pressPlusOne();
  await scanACard();

  await openBatchReview(4);

  expect(reviewRows()).toEqual([
    'Shock, M19 156 · NM · English',
    'Lightning Bolt, M10 146 · NM · English',
    'Lightning Bolt, M10 146 · NM · English',
    'Lightning Bolt, M10 146 · NM · English',
  ]);
  expect(screen.queryByRole('button', { name: /^[+-]$/ })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add 4 to collection' })).toBeEnabled();
});

test('+1 copies the finish, condition, and language, and each copy is edited on its own', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');
  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Japanese' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Foil' }));
  await swipeDownDrawer();

  await pressPlusOne();
  await fireEvent.press(scanTab().getByRole('button', { name: 'Foil' }));
  await openBatchReview(2);

  expect(reviewRows()).toEqual([
    'Lightning Bolt, M10 146 · LP · Japanese',
    'Lightning Bolt, M10 146 · Foil · LP · Japanese',
  ]);
});

test('a row opens the scan details sheet to edit that copy', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();
  await scanACard();
  await pressPlusOne();
  await openBatchReview(2);

  await fireEvent.press(screen.getAllByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' })[1]);
  await fireEvent.press(await screen.findByRole('button', { name: 'MP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, 2XM 117' }));
  await swipeDownDrawer();

  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English', 'Lightning Bolt, 2XM 117 · MP · English']);
});

test('Remove scan in the scan details sheet removes only that copy from batch review', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  await openBatchReview(2);

  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove scan' }));

  expect(screen.getByRole('header', { name: 'Scan batch' })).toBeOnTheScreen();
  expect(reviewRows()).toEqual(['Shock, M19 156 · NM · English']);
  await swipeDownDrawer();
  expect(latestScanChip('Shock, M19 156')).toBeOnTheScreen();
});

test('batch review lists scans that were not recognized, and a tap opens name search', async () => {
  nextPhotosAre('unreadable_photo', cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  await openBatchReview(1);

  expect(screen.getByRole('header', { name: 'Not recognized' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add 1 to collection' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Not recognized, Tap to search' }));

  expect(await screen.findByLabelText('Card name')).toBeOnTheScreen();
});

test('the condition and language for new scans start at near mint and English and apply only to new scans', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  expect(selectedChoice('NM')).toBeOnTheScreen();
  expect(selectedChoice('English')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'HP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'German' }));
  await swipeDownDrawer();
  await scanACard();
  await openBatchReview(2);

  expect(reviewRows()).toEqual(['Shock, M19 156 · HP · German', 'Lightning Bolt, M10 146 · NM · English']);
  expect(selectedChoice('HP')).toBeOnTheScreen();
  expect(selectedChoice('German')).toBeOnTheScreen();
});

test('Add N to collection sends every copy with its own copy ID, with identical copies in one stack', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock], { premiumMark: true }), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await scanACard();
  await openBatchReview(3);

  await addToCollection(3);

  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map(({ copy_ids, ...stack }) => ({ ...stack, copies: copy_ids.length }))).toEqual([
    { card_printing_id: lightningBoltM10.printingId, finish: 'nonfoil', condition: 'near_mint', language: 'en', copies: 2 },
    { card_printing_id: shock.printingId, finish: 'foil', condition: 'near_mint', language: 'en', copies: 1 },
  ]);
  const copyIds = sent.items.flatMap((item) => item.copy_ids);
  expect(new Set(copyIds).size).toBe(3);
  copyIds.forEach((copyId) => expect(copyId).toMatch(/^[0-9a-f-]{36}$/));
});

test('a commit closes batch review, keeps scans that were not recognized, and the binder grid shows the new cards', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await openBatchReview(2);

  await addToCollection(2);

  expect(isDrawerPresented()).toBe(false);
  expect(scanTab().getByText('Added 2 cards to your collection.')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(2);
});

test('rows cannot be opened while the commit runs', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  const commit = holdNextScanBatchCommit();

  await addToCollection(1);

  expect(screen.getByRole('button', { name: 'Add 1 to collection' })).toBeBusy();
  expect(screen.queryByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' })).not.toBeOnTheScreen();
  expect(screen.getByLabelText('Lightning Bolt, M10 146 · NM · English')).toBeOnTheScreen();
  await commit.finish();
});

test('a failed commit keeps the batch and Try again sends the same copy IDs', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('before the server adds it');

  await addToCollection(1);

  expect(screen.getByText('Could not add to your collection. Your scans are kept.')).toBeOnTheScreen();
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  const [failed, retried] = scanBatchesSentToTheServer();
  expect(retried.items).toEqual(failed.items);
  expect(isDrawerPresented()).toBe(false);
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
});

test('Try again after a commit that the server added but the phone did not hear back from adds the copies once', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await pressPlusOne();
  await openBatchReview(2);
  failNextScanBatchCommit('after the server adds it');

  await addToCollection(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await pressTab('Collection');

  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(2);
});

test('Try again after the scan batch changed adds only the copies the server did not add yet', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('after the server adds it');
  await addToCollection(1);
  await swipeDownDrawer();

  await scanACard();
  await openBatchReview(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  const [first, retried] = scanBatchesSentToTheServer();
  expect(retried.items.flatMap((item) => item.copy_ids)).toEqual(
    expect.arrayContaining(first.items.flatMap((item) => item.copy_ids)),
  );
  expect(scanTab().getByText('Added 2 cards to your collection.')).toBeOnTheScreen();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(1);
  expect(screen.getAllByRole('image', { name: 'Shock, M19 156, no price' })).toHaveLength(1);
});

test('the failed commit stays after a change to the condition and language for new scans', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('before the server adds it');
  await addToCollection(1);

  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));

  expect(screen.getByText('Could not add to your collection. Your scans are kept.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
});

test('the scan batch and its defaults survive a restart of the app', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await openBatchReview(2);
  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));
  await swipeDownDrawer();

  await restartTheApp();
  await pressTab('Scan');
  await openBatchReview(2);

  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English', 'Lightning Bolt, M10 146 · NM · English']);
  expect(screen.getByRole('button', { name: 'Not recognized, Tap to search' })).toBeOnTheScreen();
  expect(selectedChoice('LP')).toBeOnTheScreen();
});

test('a restart after a commit that did not finish sends it again with the same copy IDs', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('after the server adds it');
  await addToCollection(1);

  await restartTheApp();
  await pressTab('Scan');

  const [first, retried] = scanBatchesSentToTheServer();
  expect(retried.items).toEqual(first.items);
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(1);
});

test('another account on the phone has its own scan batch, and the first account gets its batch back', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await pressTab('Recent');
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  signInNextWithEmail('friend@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
  await act(async () => {});
  await pressTab('Scan');
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();

  await pressTab('Recent');
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  signInNextWithEmail('player@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
  await act(async () => {});
  await pressTab('Scan');

  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
});
