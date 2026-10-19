import type * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { returnToTheApp } from './app-state';
import {
  lightningAxe,
  lightningBolt2xm,
  lightningBoltM10,
  plains,
  shock,
  solRingCommander,
  tamiyosJournal,
  tamiyosJournalPrerelease,
} from './card-printings';
import { timePasses, todayIs } from './clock';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, holdNextRecognition, nextPhotosAre, notACard } from './fake-card-recognizer';
import { filesIn } from './fake-file-system';
import {
  failNextTrainingCropUpload,
  failNextTrainingCropUploadsChange,
  failTrainingCropSettingsReads,
  holdNextTrainingCropUpload,
  holdTrainingCropSettingsReads,
  publishedGalleryVersion,
  refuseNextTrainingCrop,
  removeCopyFromTheCollection,
  scanBatchesSentToTheServer,
  signInNextWithEmail,
  startSignedIn,
  trainingCropUploadAttempts,
  trainingCropUploadsAreOnTheServer,
  trainingCropsUploaded,
  turnTrainingCropUploadsOffElsewhere,
} from './fake-supabase';
import {
  appearsBefore,
  drawerScreen,
  openSettings,
  presentedAlert,
  pressAlertButton,
  pressHeaderMenuAction,
  pressTab,
  swipeDownDrawer,
  swipeRight,
} from './native-ui';
import { renderApp, restartTheApp } from './render-app';
import { openLatestScan, openScan, scanACard, scanTab } from './scanning';

const cacheCrops = 'file:///caches/training-crops/';
const keptCrops = 'file:///documents/training-crops/user-player@example.com/';
const minute = 60 * 1000;
const day = 24 * 60 * minute;

function uploadWaitIsDrawnAt(fraction: number) {
  jest
    .spyOn(jest.requireMock<typeof Crypto>('expo-crypto'), 'getRandomValues')
    .mockImplementation((values) => (values as Uint32Array).fill(Math.floor(fraction * 2 ** 32)));
}

async function signOut() {
  await pressTab('Recent');
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
}

async function signInWithGoogle(email: string) {
  signInNextWithEmail(email);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
  await act(async () => {});
}

async function addTheScanBatchToTheCollection(count: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: `Scan batch, ${count}` }));
  await swipeRight(await screen.findByRole('button', { name: 'Add to collection' }), 1);
}

function savedCopyIds() {
  return scanBatchesSentToTheServer().flatMap((batch) => batch.items.flatMap((item) => item.copy_ids));
}

beforeEach(() => {
  todayIs('2026-12-18T09:00:00Z');
  resetSampleClock();
  startSignedIn();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('a scan keeps its training crop on the phone under the user and its copy ID until the scan batch is added', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10], { trainingCrop: `${cacheCrops}bolt.jpg` }));
  await openScan();

  await scanACard();

  expect(filesIn(cacheCrops)).toEqual([]);
  expect(filesIn(keptCrops)).toHaveLength(1);
  expect(trainingCropsUploaded()).toEqual([]);
  const [kept] = filesIn(keptCrops);
  await addTheScanBatchToTheCollection(1);
  expect(kept).toBe(`${keptCrops}${savedCopyIds()[0]}.jpg`);
});

test('a saved training crop waits at least 1 day, then uploads with its evidence record and a new crop ID on return to the app, and is deleted', async () => {
  uploadWaitIsDrawnAt(0);
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm], { basis: 'collector_line', artMargin: 0.08 }));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);

  await timePasses(day - minute);
  await returnToTheApp();
  expect(trainingCropsUploaded()).toEqual([]);
  expect(filesIn(keptCrops)).toHaveLength(1);

  await timePasses(minute);
  await returnToTheApp();

  const [copyId] = savedCopyIds();
  const [upload] = trainingCropsUploaded();
  expect(trainingCropsUploaded()).toHaveLength(1);
  expect(upload!.copyId).toBe(copyId);
  expect(upload!.crop.crop_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(upload!.crop.crop_id).not.toBe(copyId);
  expect(upload!.crop).toEqual({
    crop_id: upload!.crop.crop_id,
    accepted: true,
    decision_basis: 'collector_line',
    decision_reasons: [],
    top_similarity: 0.9,
    art_margin: 0.08,
    reading_set_code: 'm10',
    reading_collector_number: '146',
    reading_premium_mark: false,
    reading_names_saved_printing: true,
    same_text_twin_count: 0,
    recognizer_version: '1.0.0 (7)',
    feature_print_revision: 2,
    gallery_version: publishedGalleryVersion,
    recognized_printing_id: lightningBoltM10.printingId,
    saved_printing_id: lightningBoltM10.printingId,
    printing_change: null,
    printing_confirmed: false,
    policy_version: 1,
  });
  expect(filesIn(keptCrops)).toEqual([]);
});

test('a training crop waits less than 7 days and uploads when the app starts after its upload time', async () => {
  uploadWaitIsDrawnAt((2 ** 32 - 1) / 2 ** 32);
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);

  await timePasses(7 * day - minute);
  await restartTheApp();
  expect(trainingCropsUploaded()).toEqual([]);

  await timePasses(minute);
  await restartTheApp();

  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual(savedCopyIds());
  expect(filesIn(keptCrops)).toEqual([]);
});

test.each([
  ['comes back to the foreground', returnToTheApp],
  ['starts again', restartTheApp],
])('a training crop that fails to upload on a lost network stays on the phone and uploads when the app %s', async (_, tryAgain) => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  await timePasses(7 * day);

  failNextTrainingCropUpload();
  await returnToTheApp();
  expect(trainingCropsUploaded()).toEqual([]);
  expect(filesIn(keptCrops)).toHaveLength(1);

  await tryAgain();

  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual(savedCopyIds());
  expect(filesIn(keptCrops)).toEqual([]);
});

test('a training crop uploads once when the app comes back to the foreground again during its upload', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  await timePasses(7 * day);

  const upload = holdNextTrainingCropUpload();
  await returnToTheApp();
  await returnToTheApp();
  await upload.finish();
  await returnToTheApp();

  expect(trainingCropsUploaded()).toHaveLength(1);
});

test.each(['uploads_off', 'storage_full', 'invalid_argument'])(
  'a training crop that the server refuses with %s is deleted with no message and not sent again',
  async (code) => {
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    await addTheScanBatchToTheCollection(1);
    await timePasses(7 * day);

    refuseNextTrainingCrop(code);
    await returnToTheApp();
    expect(filesIn(keptCrops)).toEqual([]);
    await returnToTheApp();

    expect(trainingCropsUploaded()).toEqual([]);
    expect(presentedAlert()).toBeNull();
  },
);

test('a training crop whose copy was deleted before its upload is refused and deleted', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  removeCopyFromTheCollection(savedCopyIds()[0]!);
  await timePasses(7 * day);

  await returnToTheApp();
  await returnToTheApp();

  expect(trainingCropsUploaded()).toEqual([]);
  expect(filesIn(keptCrops)).toEqual([]);
});

test('no training crop uploads while signed out, and it uploads when the user signs in again', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  await signOut();
  await timePasses(7 * day);

  await returnToTheApp();
  expect(trainingCropsUploaded()).toEqual([]);

  await signInWithGoogle('player@example.com');

  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual(savedCopyIds());
});

test('a sign out during an upload stops the uploads that wait behind it', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  await addTheScanBatchToTheCollection(2);
  await timePasses(7 * day);

  const upload = holdNextTrainingCropUpload();
  await returnToTheApp();
  await signOut();
  await upload.finish();
  expect(trainingCropsUploaded()).toHaveLength(1);

  await signInWithGoogle('player@example.com');

  expect(trainingCropsUploaded()).toHaveLength(2);
});

test('each account on the phone uploads only its own training crops', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  const [playerCopyId] = savedCopyIds();
  await signOut();
  await signInWithGoogle('friend@example.com');
  await pressTab('Scan');
  await scanACard();
  await addTheScanBatchToTheCollection(1);
  const [, friendCopyId] = savedCopyIds();
  await timePasses(7 * day);

  await returnToTheApp();
  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual([friendCopyId]);
  expect(filesIn(keptCrops)).toEqual([`${keptCrops}${playerCopyId}.jpg`]);

  await signOut();
  await signInWithGoogle('player@example.com');

  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual([friendCopyId, playerCopyId]);
  expect(filesIn('file:///documents/training-crops/')).toEqual([]);
});

test('a basic land and a recognition with no candidates keep no training crop', async () => {
  nextPhotosAre(cardRecognition([plains]), cardRecognition([]));
  await openScan();

  await scanACard();
  await scanACard();

  expect(filesIn(cacheCrops)).toEqual([]);
  expect(filesIn(keptCrops)).toEqual([]);
});

describe('the Upload training crops switch', () => {
  const metaLine =
    'Images of cards you save help improve card recognition. They wait on your phone for up to 7 days. Uploaded crops are not stored with your account and cannot be removed.';

  async function openUploadTrainingCrops() {
    await pressTab('Recent');
    await openSettings();
    return screen.getByRole('switch', { name: 'Upload training crops' });
  }

  async function turnUploadsOff() {
    await fireEvent.press(await openUploadTrainingCrops());
    await swipeDownDrawer();
  }

  test('the Training crops card sits below the Scan sounds card, with the switch on and its meta line', async () => {
    await renderApp();

    const uploads = await openUploadTrainingCrops();

    expect(uploads).toBeChecked();
    expect(uploads).toBeEnabled();
    expect(uploads).toHaveAccessibleName('Upload training crops');
    expect(within(uploads).getByText(metaLine)).toBeOnTheScreen();
    expect(appearsBefore(screen.getByRole('switch', { name: 'Scan sounds' }), uploads)).toBe(true);
    expect(appearsBefore(uploads, screen.getByRole('button', { name: 'Sign out' }))).toBe(true);
  });

  test('the switch is off and disabled until the training crop settings load', async () => {
    const read = holdTrainingCropSettingsReads();
    await renderApp();

    const uploads = await openUploadTrainingCrops();
    expect(uploads).not.toBeChecked();
    expect(uploads).toBeDisabled();

    await read.finish();
    expect(uploads).toBeChecked();
    expect(uploads).toBeEnabled();
  });

  test('a failed read of the training crop settings keeps the switch disabled until the user returns to the app', async () => {
    failTrainingCropSettingsReads(1);
    await renderApp();
    const uploads = await openUploadTrainingCrops();
    expect(uploads).toBeDisabled();

    await returnToTheApp();

    expect(uploads).toBeEnabled();
    expect(uploads).toBeChecked();
  });

  test('the switch shows the setting of the account, and turning it off follows the account to the next start', async () => {
    turnTrainingCropUploadsOffElsewhere();
    await renderApp();
    const uploads = await openUploadTrainingCrops();
    expect(uploads).not.toBeChecked();

    await fireEvent.press(uploads);
    expect(uploads).toBeChecked();
    expect(trainingCropUploadsAreOnTheServer()).toBe(true);
    await fireEvent.press(uploads);
    expect(trainingCropUploadsAreOnTheServer()).toBe(false);

    await restartTheApp();
    expect(await openUploadTrainingCrops()).not.toBeChecked();
  });

  test('a failed change puts the switch back and says so', async () => {
    failNextTrainingCropUploadsChange();
    await renderApp();
    const uploads = await openUploadTrainingCrops();

    await fireEvent.press(uploads);

    expect(uploads).toBeChecked();
    expect(trainingCropUploadsAreOnTheServer()).toBe(true);
    expect(presentedAlert()).toEqual({
      title: 'Could not change training crop uploads',
      message: 'Check your connection.',
      buttons: ['OK'],
    });
  });

  test('turning training crop uploads off deletes every waiting training crop, and none uploads', async () => {
    nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
    await openScan();
    await scanACard();
    await scanACard();
    await addTheScanBatchToTheCollection(2);
    expect(filesIn(keptCrops)).toHaveLength(2);

    await turnUploadsOff();
    await timePasses(7 * day);
    await returnToTheApp();
    await restartTheApp();

    expect(filesIn(keptCrops)).toEqual([]);
    expect(trainingCropsUploaded()).toEqual([]);
  });

  test('a failed change to off keeps the waiting training crops', async () => {
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    await addTheScanBatchToTheCollection(1);

    failNextTrainingCropUploadsChange();
    await turnUploadsOff();
    await timePasses(7 * day);
    await returnToTheApp();

    expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual(savedCopyIds());
  });

  test('with training crop uploads off, adding the scan batch deletes its training crops at once, with no upload', async () => {
    turnTrainingCropUploadsOffElsewhere();
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();

    await addTheScanBatchToTheCollection(1);

    expect(savedCopyIds()).toHaveLength(1);
    expect(filesIn(keptCrops)).toEqual([]);
    await timePasses(7 * day);
    await restartTheApp();
    expect(trainingCropUploadAttempts()).toBe(0);
  });

  test('a training crop that waits while uploads are turned off on another phone is refused with uploads_off and deleted', async () => {
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    await addTheScanBatchToTheCollection(1);
    turnTrainingCropUploadsOffElsewhere();
    await timePasses(7 * day);

    await returnToTheApp();

    expect(trainingCropUploadAttempts()).toBe(1);
    expect(trainingCropsUploaded()).toEqual([]);
    expect(filesIn(keptCrops)).toEqual([]);
  });
});

async function waitForTheUploads() {
  await timePasses(7 * day);
  await returnToTheApp();
}

function uploadedRecords() {
  return trainingCropsUploaded().map(({ crop }) => crop);
}

async function closeTheScanDetails() {
  await swipeDownDrawer();
}

async function openThePrintingsPicker(setCode: string) {
  await fireEvent.press(scanTab().getByRole('button', { name: setCode }));
}

async function choosePrinting(name: string) {
  await fireEvent.press(await screen.findByRole('button', { name }));
}

test('a switch in Other options labels the training crop with the chosen card printing and says how it changed', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');

  await choosePrinting('Lightning Bolt, 2XM 117');
  await closeTheScanDetails();
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBolt2xm.printingId,
      reading_names_saved_printing: false,
      printing_change: 'other_options',
      printing_confirmed: false,
    }),
  ]);
});

test('a switch in the printing picker labels the training crop with the chosen card printing and says how it changed', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, 2XM 117');
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBolt2xm.printingId,
      printing_change: 'printing_picker',
      printing_confirmed: false,
    }),
  ]);
});

test('a name search fix labels the training crop with the card printing the user chose, and keeps the card printing the scanner found first', async () => {
  nextPhotosAre(cardRecognition([shock], { accepted: false }));
  await openScan();
  await scanACard();
  await openLatestScan('Shock, M19 156');
  await fireEvent.press(screen.getByRole('button', { name: 'None of these: search' }));

  await fireEvent.changeText(screen.getByLabelText('Card name'), 'bolt');
  await choosePrinting('Lightning Bolt');
  await choosePrinting('Lightning Bolt, 2XM 117');
  await closeTheScanDetails();
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      accepted: false,
      decision_basis: null,
      recognized_printing_id: shock.printingId,
      saved_printing_id: lightningBolt2xm.printingId,
      reading_names_saved_printing: false,
      printing_change: 'name_search',
      printing_confirmed: false,
    }),
  ]);
});

test('choosing the current card printing in the printing picker confirms it in the evidence record', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, M10 146');
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      saved_printing_id: lightningBoltM10.printingId,
      printing_change: null,
      printing_confirmed: true,
    }),
  ]);
});

test('a change after a confirmation clears the confirmation and records the last change', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();
  await scanACard();
  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, M10 146');

  await openLatestScan('Lightning Bolt, M10 146');
  await choosePrinting('Lightning Bolt, 2XM 117');
  await closeTheScanDetails();
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      saved_printing_id: lightningBolt2xm.printingId,
      printing_change: 'other_options',
      printing_confirmed: false,
    }),
  ]);
});

test('a switch back to the card printing the scanner found first still records the change', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, 2XM 117');

  await openThePrintingsPicker('2XM');
  await choosePrinting('Lightning Bolt, M10 146');
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBoltM10.printingId,
      printing_change: 'printing_picker',
      printing_confirmed: false,
    }),
  ]);
});

test('a confirmed same-text twin keeps its twin count in the evidence record', async () => {
  nextPhotosAre(cardRecognition([tamiyosJournal, tamiyosJournalPrerelease], { sameTextTwinCount: 1 }));
  await openScan();
  await scanACard();

  await openThePrintingsPicker('SOI');
  await choosePrinting("Tamiyo's Journal, SOI 265");
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      same_text_twin_count: 1,
      recognized_printing_id: tamiyosJournal.printingId,
      saved_printing_id: tamiyosJournal.printingId,
      printing_change: null,
      printing_confirmed: true,
    }),
  ]);
});

test('each accept basis and an abstain go into the evidence record of their training crops', async () => {
  nextPhotosAre(
    cardRecognition([lightningBoltM10], { basis: 'collector_line' }),
    cardRecognition([shock], { basis: 'set_code' }),
    cardRecognition([lightningAxe], { basis: 'unique_art', artMargin: 0.2 }),
    cardRecognition([solRingCommander], { accepted: false, artMargin: null }),
  );
  await openScan();
  for (let scanned = 0; scanned < 4; scanned += 1) {
    await scanACard();
  }

  await addTheScanBatchToTheCollection(4);

  await waitForTheUploads();

  expect(
    uploadedRecords().map(({ saved_printing_id, accepted, decision_basis, art_margin }) => ({
      saved_printing_id,
      accepted,
      decision_basis,
      art_margin,
    })),
  ).toEqual([
    { saved_printing_id: lightningBoltM10.printingId, accepted: true, decision_basis: 'collector_line', art_margin: 0.12 },
    { saved_printing_id: shock.printingId, accepted: true, decision_basis: 'set_code', art_margin: 0.12 },
    { saved_printing_id: lightningAxe.printingId, accepted: true, decision_basis: 'unique_art', art_margin: 0.2 },
    { saved_printing_id: solRingCommander.printingId, accepted: false, decision_basis: null, art_margin: null },
  ]);
});

test('a +1 copy is saved with no training crop of its own', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
  await addTheScanBatchToTheCollection(2);
  await waitForTheUploads();

  const [scannedCopyId, plusOneCopyId] = savedCopyIds();
  expect(plusOneCopyId).toBeDefined();
  expect(trainingCropsUploaded().map(({ copyId }) => copyId)).toEqual([scannedCopyId]);
});

test('a photo that is not a card keeps no training crop', async () => {
  nextPhotosAre(notACard(), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();

  await addTheScanBatchToTheCollection(1);

  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([expect.objectContaining({ saved_printing_id: shock.printingId })]);
  expect(filesIn(cacheCrops)).toEqual([]);
});

async function openBatchReview(count: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: `Scan batch, ${count}` }));
  await screen.findByRole('button', { name: 'Add to collection' });
}

test('Remove scan deletes the training crop of that scan and keeps the others', async () => {
  nextPhotosAre(
    cardRecognition([lightningBoltM10], { trainingCrop: `${cacheCrops}bolt.jpg` }),
    cardRecognition([shock], { trainingCrop: `${cacheCrops}shock.jpg` }),
  );
  await openScan();
  await scanACard();
  await scanACard();
  await openBatchReview(2);

  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove scan' }));

  const kept = filesIn(keptCrops);
  await swipeDownDrawer();
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();
  expect(kept).toEqual([`${keptCrops}${savedCopyIds()[0]}.jpg`]);
  expect(uploadedRecords()).toEqual([expect.objectContaining({ saved_printing_id: shock.printingId })]);
});

test('Remove all scans deletes the training crops of every scan in the scan batch', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  await scanACard();
  expect(filesIn(keptCrops)).toHaveLength(2);
  await openBatchReview(2);

  await pressHeaderMenuAction(drawerScreen(), 'More', ['Remove all scans']);
  await pressAlertButton('Remove');

  expect(filesIn(keptCrops)).toEqual([]);
});

test('a recognition that ends after Remove all scans leaves no training crop on the phone', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();
  const recognition = holdNextRecognition();
  await scanACard();
  await openBatchReview(1);

  await pressHeaderMenuAction(drawerScreen(), 'More', ['Remove all scans']);
  await pressAlertButton('Remove');
  await recognition.finish();

  expect(filesIn(cacheCrops)).toEqual([]);
  expect(filesIn(keptCrops)).toEqual([]);
});

test('a recognition that ends after a sign out leaves no training crop on the phone', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  const recognition = holdNextRecognition();
  await scanACard();

  await signOut();
  await recognition.finish();

  expect(filesIn(cacheCrops)).toEqual([]);
  expect(filesIn('file:///documents/training-crops/')).toEqual([]);
});

test('a scan keeps its training crop, its first card printing, and its printing change across a restart', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');
  await choosePrinting('Lightning Bolt, 2XM 117');
  await closeTheScanDetails();

  await restartTheApp();
  await pressTab('Scan');
  await addTheScanBatchToTheCollection(1);
  await waitForTheUploads();

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBolt2xm.printingId,
      printing_change: 'other_options',
      printing_confirmed: false,
    }),
  ]);
  expect(filesIn(keptCrops)).toEqual([]);
});

test('a scan batch saved in the old format loads with no training crops', async () => {
  new File(Paths.document, 'scan-batch-user-player@example.com.json').write(
    JSON.stringify({
      formatVersion: 1,
      scans: [
        {
          scanId: 'older-scan',
          options: [lightningBoltM10, lightningBolt2xm],
          sameTextTwinCount: 0,
          premiumMark: false,
          printing: lightningBolt2xm,
          finish: 'nonfoil',
          condition: 'near_mint',
          language: 'en',
        },
      ],
      commitPending: false,
    }),
  );
  await openScan();

  await addTheScanBatchToTheCollection(1);

  await waitForTheUploads();

  expect(savedCopyIds()).toEqual(['older-scan']);
  expect(trainingCropsUploaded()).toEqual([]);
});
