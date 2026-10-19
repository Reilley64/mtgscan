import { fireEvent, screen } from 'expo-router/testing-library';

import { lightningBolt2xm, lightningBoltM10, plains } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre } from './fake-card-recognizer';
import { filesIn } from './fake-file-system';
import {
  publishedGalleryVersion,
  refuseNextTrainingCrop,
  scanBatchesSentToTheServer,
  startSignedIn,
  trainingCropsUploaded,
} from './fake-supabase';
import { swipeRight } from './native-ui';
import { openScan, scanACard, scanTab } from './scanning';

const cacheCrops = 'file:///caches/training-crops/';
const keptCrops = 'file:///documents/training-crops/user-player@example.com/';

async function addTheScanBatchToTheCollection(count: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: `Scan batch, ${count}` }));
  await swipeRight(await screen.findByRole('button', { name: 'Add to collection' }), 1);
}

function savedCopyIds() {
  return scanBatchesSentToTheServer().flatMap((batch) => batch.items.flatMap((item) => item.copy_ids));
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
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

test('adding a scan batch uploads the training crop of an accepted scan with its evidence record and a new crop ID, then deletes the crop', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm], { basis: 'collector_line', artMargin: 0.08 }));
  await openScan();
  await scanACard();

  await addTheScanBatchToTheCollection(1);

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

test('a training crop that the server refuses is deleted and not sent again', async () => {
  refuseNextTrainingCrop('unknown_copy');
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await addTheScanBatchToTheCollection(1);

  expect(trainingCropsUploaded()).toEqual([]);
  expect(filesIn(keptCrops)).toEqual([]);
});

test('a basic land and a recognition with no candidates keep no training crop', async () => {
  nextPhotosAre(cardRecognition([plains]), cardRecognition([]));
  await openScan();

  await scanACard();
  await scanACard();

  expect(filesIn(cacheCrops)).toEqual([]);
  expect(filesIn(keptCrops)).toEqual([]);
});
