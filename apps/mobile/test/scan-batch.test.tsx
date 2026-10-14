import { File, Paths } from 'expo-file-system';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { lightningBolt2xm, lightningBoltM10, plains, shock } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, holdNextRecognition, nextPhotosAre } from './fake-card-recognizer';
import { scanFeedback } from './fake-scan-feedback';
import {
  failNextScanBatchCommit,
  holdNextScanBatchCommit,
  scanBatchesSentToTheServer,
  signInNextWithEmail,
  startSignedIn,
} from './fake-supabase';
import {
  drawerBackButton,
  drawerScreen,
  drawerTitle,
  headerButton,
  headerButtonIsDisabled,
  headerMenuRows,
  isDrawerPresented,
  openSettings,
  presentedDrawer,
  presentedDrawerCount,
  pressDrawerBack,
  pressHeaderMenuAction,
  pressTab,
  selectedTab,
  showsSpinner,
  swipeDownDrawer,
  swipeBackFromTheLeftEdge,
  swipeHandlePosition,
  swipeRight,
  tabHeader,
} from './native-ui';
import { restartTheApp } from './render-app';
import {
  expectDisabledQuickActions,
  latestScanChip,
  openLatestScan,
  openScan,
  scanACard,
  scanTab,
} from './scanning';

async function openBatchReview(count?: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: count ? `Scan batch, ${count}` : 'Scan batch' }));
  await screen.findByRole('button', { name: /^(Add to collection|Try again)$/ });
}

function reviewRows() {
  return screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string | undefined)
    .filter((label) => label?.includes(' · '));
}

async function addToCollection() {
  await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 1);
}

async function tryAgain() {
  await swipeRight(screen.getByRole('button', { name: 'Try again' }), 1);
}

async function pressPlusOne() {
  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
}

const savedScan = {
  options: [],
  sameTextTwinCount: 0,
  premiumMark: false,
  finish: 'nonfoil',
  condition: 'near_mint',
  language: 'en',
};

function saveScanBatchFromAnOlderBuild(scans: object[]) {
  new File(Paths.document, 'scan-batch-user-player@example.com.json').write(
    JSON.stringify({ formatVersion: 1, scans, commitPending: false }),
  );
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

test('a scan that is not recognized stays out of the scan batch, so the rows, the title, the batch badge, and Remove N scans count the same scans', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();

  await scanACard();
  await pressPlusOne();
  await scanACard();

  expect(latestScanChip('Not recognized, Tap to search')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
  expect(scanTab().getByText('2')).toBeOnTheScreen();
  await openBatchReview(2);
  expect(drawerTitle()).toBe('2 cards scanned');
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English', 'Lightning Bolt, M10 146 · NM · English']);
  expect(screen.queryByRole('header', { name: 'Not recognized' })).not.toBeOnTheScreen();
  expect(screen.queryByText('Not recognized')).not.toBeOnTheScreen();
  expect(headerMenuRows(drawerScreen(), 'More')).toEqual([
    { title: 'Remove all scans', destructive: true, rows: [{ title: 'Remove 2 scans', destructive: true }] },
  ]);
});

test('choosing a card printing in name search for a scan that was not recognized adds it to the scan batch as one scan with the defaults', async () => {
  nextPhotosAre('unreadable_photo');
  await openScan();
  await scanACard();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  await openLatestScan('Not recognized, Tap to search');

  await fireEvent.changeText(await screen.findByLabelText('Card name'), 'bolt');
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt, 2XM 117' }));
  await swipeDownDrawer();

  expect(latestScanChip('Lightning Bolt, 2XM 117')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
  await openBatchReview(1);
  expect(reviewRows()).toEqual(['Lightning Bolt, 2XM 117 · NM · English']);
  await addToCollection();
  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map(({ copy_ids, ...stack }) => ({ ...stack, copies: copy_ids.length }))).toEqual([
    { card_printing_id: lightningBolt2xm.printingId, finish: 'nonfoil', condition: 'near_mint', language: 'en', copies: 1 },
  ]);
});

test('a new scan replaces a scan that was not recognized on the chip, and the scan that was not recognized is never added', async () => {
  nextPhotosAre('unreadable_photo', cardRecognition([shock]));
  await openScan();
  await scanACard();

  await scanACard();

  expect(latestScanChip('Shock, M19 156')).toBeOnTheScreen();
  expect(scanTab().queryByText('Not recognized')).not.toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
  await openBatchReview(1);
  expect(reviewRows()).toEqual(['Shock, M19 156 · NM · English']);
  expect(screen.queryByText('Not recognized')).not.toBeOnTheScreen();
  await addToCollection();
  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.flatMap((item) => item.copy_ids)).toHaveLength(1);
});

test('the batch button opens batch review as a bottom drawer with a grabber at full height only', async () => {
  await openScan();

  await openBatchReview();

  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [1], openingHeight: 1 });
  expect(drawerTitle()).toBe('0 cards scanned');
  expect(screen.getByRole('button', { name: 'Add to collection' })).toBeDisabled();
  await swipeDownDrawer();
  expect(isDrawerPresented()).toBe(false);
});

test('batch review is titled with the number of cards scanned, one card in the singular', async () => {
  nextPhotosAre('unreadable_photo', cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await scanACard();

  await openBatchReview(1);

  expect(drawerTitle()).toBe('1 card scanned');
  await swipeDownDrawer();
  await pressPlusOne();
  await openBatchReview(2);
  expect(drawerTitle()).toBe('2 cards scanned');
  expect(screen.getByRole('button', { name: 'Add to collection' })).toBeEnabled();
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
  expect(drawerTitle()).toBe('4 cards scanned');
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
  expect(scanTab().getByRole('button', { name: 'LP' })).toBeEnabled();
  expect(scanTab().getByRole('button', { name: 'JA' })).toBeEnabled();
  await fireEvent.press(scanTab().getByRole('button', { name: 'Foil' }));
  await openBatchReview(2);

  expect(reviewRows()).toEqual([
    'Lightning Bolt, M10 146 · LP · Japanese',
    'Lightning Bolt, M10 146 · Foil · LP · Japanese',
  ]);
});

test('a row pushes the scan details into batch review, with a back button labeled with the drawer title', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();
  await scanACard();
  await pressPlusOne();
  await openBatchReview(2);
  expect(drawerBackButton()).toBeNull();

  await fireEvent.press(screen.getAllByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' })[1]);
  await fireEvent.press(await screen.findByRole('button', { name: 'MP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, 2XM 117' }));

  expect(presentedDrawerCount()).toBe(1);
  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [1], openingHeight: 1 });
  expect(drawerBackButton()).toEqual({ label: '2 cards scanned' });
  await pressDrawerBack();
  expect(drawerBackButton()).toBeNull();
  expect(drawerTitle()).toBe('2 cards scanned');
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English', 'Lightning Bolt, 2XM 117 · MP · English']);
});

test('a swipe from the left edge takes the scan details back to the batch review list', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' }));
  await screen.findByRole('button', { name: 'Remove scan' });

  await swipeBackFromTheLeftEdge();

  expect(screen.queryByRole('button', { name: 'Remove scan' })).not.toBeOnTheScreen();
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
  expect(isDrawerPresented()).toBe(true);
});

test('Remove scan in the scan details removes only that copy and returns to the batch review list', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  await openBatchReview(2);

  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove scan' }));

  expect(drawerBackButton()).toBeNull();
  expect(presentedDrawerCount()).toBe(1);
  expect(drawerTitle()).toBe('1 card scanned');
  expect(reviewRows()).toEqual(['Shock, M19 156 · NM · English']);
  await swipeDownDrawer();
  expect(latestScanChip('Shock, M19 156')).toBeOnTheScreen();
});

test('Add to collection sends every copy with its own copy ID, with identical copies in one stack', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock], { premiumMark: true }), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await scanACard();
  await openBatchReview(3);

  await addToCollection();

  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map(({ copy_ids, ...stack }) => ({ ...stack, copies: copy_ids.length }))).toEqual([
    { card_printing_id: lightningBoltM10.printingId, finish: 'nonfoil', condition: 'near_mint', language: 'en', copies: 2 },
    { card_printing_id: shock.printingId, finish: 'foil', condition: 'near_mint', language: 'en', copies: 1 },
  ]);
  const copyIds = sent.items.flatMap((item) => item.copy_ids);
  expect(new Set(copyIds).size).toBe(3);
  copyIds.forEach((copyId) => expect(copyId).toMatch(/^[0-9a-f-]{36}$/));
});

function expectAnEmptyChip() {
  expect(selectedTab()).toHaveTextContent('NonfoilNMEN+1', { exact: true });
  expectDisabledQuickActions();
}

test('a commit closes batch review, leaves the chip empty, and the binder grid shows the new cards', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await pressPlusOne();
  await openBatchReview(2);

  await addToCollection();

  expect(isDrawerPresented()).toBe(false);
  expectAnEmptyChip();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(2);
});

test('a commit adds only the recognized scans and keeps a scan that was not recognized on the chip', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  await scanACard();
  await scanACard();
  await openBatchReview(1);

  await addToCollection();

  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map((item) => item.card_printing_id)).toEqual([lightningBoltM10.printingId]);
  expect(latestScanChip('Not recognized, Tap to search')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
});

test('swiping Add to collection past the threshold adds the batch, and releasing it before the threshold adds nothing', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);

  await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 0.5);
  expect(scanBatchesSentToTheServer()).toEqual([]);
  expect(scanFeedback()).not.toContain('light impact');

  await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 1);
  expect(scanFeedback()).toContain('light impact');
  expect(scanBatchesSentToTheServer()).toHaveLength(1);
  expect(isDrawerPresented()).toBe(false);
});

test('the VoiceOver default action on Add to collection adds the batch without a swipe', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);

  await fireEvent(screen.getByRole('button', { name: 'Add to collection' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });

  expect(scanBatchesSentToTheServer()).toHaveLength(1);
  expect(isDrawerPresented()).toBe(false);
});

test('Add to collection shows a spinner on its handle while the commit runs, and rows cannot be opened', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  const commit = holdNextScanBatchCommit();

  await addToCollection();

  const control = screen.getByRole('button', { name: 'Add to collection' });
  expect(control).toBeBusy();
  expect(showsSpinner(control)).toBe(true);
  expect(swipeHandlePosition(control)).toBeCloseTo(1);
  await swipeRight(control, 1);
  expect(scanBatchesSentToTheServer()).toHaveLength(1);
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

  await addToCollection();

  expect(screen.getByText('Could not add to your collection. Your scans are kept.')).toBeOnTheScreen();
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
  await tryAgain();

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

  await addToCollection();
  await tryAgain();
  await pressTab('Collection');

  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(2);
});

test('Try again after the scan batch changed adds only the copies the server did not add yet', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('after the server adds it');
  await addToCollection();
  await swipeDownDrawer();

  await scanACard();
  await openBatchReview(2);
  await tryAgain();

  const [first, retried] = scanBatchesSentToTheServer();
  expect(retried.items.flatMap((item) => item.copy_ids)).toEqual(
    expect.arrayContaining(first.items.flatMap((item) => item.copy_ids)),
  );
  expectAnEmptyChip();
  await pressTab('Collection');
  expect(await screen.findAllByRole('image', { name: 'Lightning Bolt, M10 146, no price' })).toHaveLength(1);
  expect(screen.getAllByRole('image', { name: 'Shock, M19 156, no price' })).toHaveLength(1);
});

async function removeAllScans(count: string) {
  await pressHeaderMenuAction(drawerScreen(), 'More', ['Remove all scans', count]);
}

test('the More button in batch review opens Remove all scans, whose submenu offers Remove N scans for every scan in the scan batch', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  await scanACard();
  await pressPlusOne();
  await scanACard();
  await openBatchReview(2);

  expect(tabHeader(drawerScreen()).buttons).toEqual(['More']);
  expect(headerButton(drawerScreen(), 'More')).toEqual({ type: 'menu', label: undefined, symbol: 'ellipsis', hint: undefined });
  expect(headerButtonIsDisabled(drawerScreen(), 'More')).toBe(false);
  expect(headerMenuRows(drawerScreen(), 'More')).toEqual([
    { title: 'Remove all scans', destructive: true, rows: [{ title: 'Remove 2 scans', destructive: true }] },
  ]);
});

test('Remove N scans empties the scan batch, the batch badge, and the latest-scan chip, closes batch review, and adds nothing', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]), 'unreadable_photo', cardRecognition([plains]));
  await openScan();
  await scanACard();
  await scanACard();
  await scanACard();
  await scanACard();
  expect(scanTab().getByText('Basic land, not tracked')).toBeOnTheScreen();
  await openBatchReview(2);

  await removeAllScans('Remove 2 scans');

  expect(isDrawerPresented()).toBe(false);
  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  expectAnEmptyChip();
  expect(scanBatchesSentToTheServer()).toEqual([]);
  await openBatchReview();
  expect(drawerTitle()).toBe('0 cards scanned');
  expect(reviewRows()).toEqual([]);
});

test('removed scans stay removed after a restart of the app', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);

  await removeAllScans('Remove 1 scan');
  await restartTheApp();
  await pressTab('Scan');

  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  await openBatchReview();
  expect(reviewRows()).toEqual([]);
});

test('removing every scan after a failed commit leaves nothing to send again', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('before the server adds it');
  await addToCollection();

  await removeAllScans('Remove 1 scan');
  await restartTheApp();
  await pressTab('Scan');

  expect(scanBatchesSentToTheServer()).toHaveLength(1);
  await openBatchReview();
  expect(screen.getByRole('button', { name: 'Add to collection' })).toBeDisabled();
  expect(screen.queryByText('Could not add to your collection. Your scans are kept.')).not.toBeOnTheScreen();
});

test('a card still being recognized when every scan is removed does not come back into the scan batch', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  const recognition = holdNextRecognition();
  await scanACard();
  await openBatchReview(1);

  await removeAllScans('Remove 1 scan');
  await recognition.finish();

  expect(scanTab().getByRole('button', { name: 'Scan batch' })).toBeOnTheScreen();
  expectAnEmptyChip();
  await openBatchReview();
  expect(reviewRows()).toEqual([]);
});

test('a card still being recognized when every scan is removed plays no haptic and no sound', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await openScan();
  await scanACard();
  const recognition = holdNextRecognition();
  await scanACard();
  await openBatchReview(1);
  const feedbackBeforeRemoving = scanFeedback().length;

  await removeAllScans('Remove 1 scan');
  await recognition.finish();

  expect(scanFeedback().slice(feedbackBeforeRemoving)).toEqual([]);
});

test('the More button is disabled when the scan batch is empty', async () => {
  await openScan();

  await openBatchReview();

  expect(headerButtonIsDisabled(drawerScreen(), 'More')).toBe(true);
});

test('the More button is hidden while the commit runs', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  const commit = holdNextScanBatchCommit();

  await addToCollection();

  expect(tabHeader(drawerScreen()).buttons).toEqual([]);
  await commit.finish();
});

test('Remove all scans is a submenu, not an action, so the scan batch stays until Remove N scans is chosen', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);

  await expect(pressHeaderMenuAction(drawerScreen(), 'More', ['Remove all scans'])).rejects.toThrow('is not a menu action');

  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
  await swipeDownDrawer();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
});

test('the scan batch survives a restart of the app', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await pressPlusOne();

  await restartTheApp();
  await pressTab('Scan');
  await openBatchReview(2);

  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English', 'Lightning Bolt, M10 146 · NM · English']);
});

test('a scan batch saved by an older build still loads, without its scans that were not recognized', async () => {
  saveScanBatchFromAnOlderBuild([
    { ...savedScan, scanId: 'older-recognized', printing: lightningBoltM10 },
    { ...savedScan, scanId: 'older-not-recognized', printing: null },
  ]);

  await openScan();

  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
  expect(scanTab().queryByText('Not recognized')).not.toBeOnTheScreen();
  expectDisabledQuickActions();
  await openBatchReview(1);
  expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
  expect(screen.queryByText('Not recognized')).not.toBeOnTheScreen();
  await addToCollection();
  const [sent] = scanBatchesSentToTheServer();
  expect(sent.items.map(({ card_printing_id, copy_ids }) => ({ card_printing_id, copy_ids }))).toEqual([
    { card_printing_id: lightningBoltM10.printingId, copy_ids: ['older-recognized'] },
  ]);
});

test('a restart after a commit that did not finish sends it again with the same copy IDs', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openBatchReview(1);
  failNextScanBatchCommit('after the server adds it');
  await addToCollection();

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
