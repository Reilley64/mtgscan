import type * as Crypto from 'expo-crypto';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { returnToTheApp } from './app-state';
import { lightningBolt2xm, lightningBoltM10, plains, shock } from './card-printings';
import { timePasses, todayIs } from './clock';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre } from './fake-card-recognizer';
import { filesIn } from './fake-file-system';
import {
  failNextTrainingCropUpload,
  holdNextTrainingCropUpload,
  publishedGalleryVersion,
  refuseNextTrainingCrop,
  removeCopyFromTheCollection,
  scanBatchesSentToTheServer,
  signInNextWithEmail,
  startSignedIn,
  trainingCropsUploaded,
} from './fake-supabase';
import { openSettings, pressTab, swipeRight } from './native-ui';
import { restartTheApp } from './render-app';
import { openScan, scanACard, scanTab } from './scanning';

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
  'a training crop that the server refuses with %s is deleted and not sent again',
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
