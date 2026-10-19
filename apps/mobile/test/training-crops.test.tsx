import { File, Paths } from 'expo-file-system';
import { fireEvent, screen } from 'expo-router/testing-library';

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
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre, notACard } from './fake-card-recognizer';
import { filesIn } from './fake-file-system';
import {
  publishedGalleryVersion,
  refuseNextTrainingCrop,
  scanBatchesSentToTheServer,
  startSignedIn,
  trainingCropsUploaded,
} from './fake-supabase';
import {
  drawerScreen,
  pressAlertButton,
  pressHeaderMenuAction,
  pressTab,
  swipeDownDrawer,
  swipeRight,
} from './native-ui';
import { restartTheApp } from './render-app';
import { openLatestScan, openScan, scanACard, scanTab } from './scanning';

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

test('a switch in the printings picker labels the training crop with the chosen card printing and says how it changed', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, 2XM 117');
  await addTheScanBatchToTheCollection(1);

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBolt2xm.printingId,
      printing_change: 'printings_picker',
      printing_confirmed: false,
    }),
  ]);
});

test('a name search fix labels the training crop with the card printing the user chose, and keeps the scanner first card printing', async () => {
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

test('choosing the current card printing in the printings picker confirms it in the evidence record', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, M10 146');
  await addTheScanBatchToTheCollection(1);

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

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      saved_printing_id: lightningBolt2xm.printingId,
      printing_change: 'other_options',
      printing_confirmed: false,
    }),
  ]);
});

test('a switch back to the scanner first card printing still records the change', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openThePrintingsPicker('M10');
  await choosePrinting('Lightning Bolt, 2XM 117');

  await openThePrintingsPicker('2XM');
  await choosePrinting('Lightning Bolt, M10 146');
  await addTheScanBatchToTheCollection(1);

  expect(uploadedRecords()).toEqual([
    expect.objectContaining({
      recognized_printing_id: lightningBoltM10.printingId,
      saved_printing_id: lightningBoltM10.printingId,
      printing_change: 'printings_picker',
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

  expect(savedCopyIds()).toEqual(['older-scan']);
  expect(trainingCropsUploaded()).toEqual([]);
});
