import { act, fireEvent, screen } from 'expo-router/testing-library';

import {
  lightningAxe,
  lightningBolt2xm,
  lightningBoltM10,
  shock,
  solRingCommander,
  solRingEtched,
} from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, galleryParityIs, holdNextRecognition, nextPhotosAre, notACard } from './fake-card-recognizer';
import { startSignedIn } from './fake-supabase';
import { scoreBinDeck, type TestDeckCard } from './scanner-evidence/bin-deck';
import { openSettings, pressTab, swipeDownDrawer } from './native-ui';
import { renderApp } from './render-app';
import { openScan, scanACard } from './scanning';

function deckOf(...printings: TestDeckCard[]): TestDeckCard[] {
  return printings;
}

function metroLog() {
  return jest
    .mocked(console.info)
    .mock.calls.map(([line]) => ` LOG  ${String(line)}`)
    .join('\n');
}

async function scanCards(count: number) {
  await openScan();
  for (let card = 0; card < count; card += 1) {
    await scanACard();
  }
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a bin-deck run scores each recognition in the development log against the test deck, in deck order', async () => {
  nextPhotosAre(
    cardRecognition([lightningBoltM10, lightningBolt2xm]),
    cardRecognition([shock], { accepted: false }),
    cardRecognition([solRingEtched, solRingCommander]),
  );
  await scanCards(3);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock, solRingCommander), metroLog());

  expect(run.summary).toMatchObject({
    presented: 3,
    identityTop1: 3,
    printingTop1: 2,
    correctAccepts: 1,
    falseAccepts: 1,
    wrongCardAccepts: 0,
    abstentions: 1,
    missedCards: 0,
    results: 3,
  });
  expect(run.cards.map(({ card, status }) => [card, status])).toEqual([
    ['Lightning Bolt M10 #146', 'correct-accept'],
    ['Shock M19 #156', 'abstained'],
    ['Sol Ring C21 #263', 'false-accept'],
  ]);
});

test('an accept of a card outside the test deck is a wrong-card accept of the card being scanned', async () => {
  nextPhotosAre(cardRecognition([lightningAxe]), cardRecognition([shock]));
  await scanCards(2);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock), metroLog());

  expect(run.summary).toMatchObject({ presented: 2, identityTop1: 1, falseAccepts: 1, wrongCardAccepts: 1, missedCards: 0 });
  expect(run.gates.find((gate) => gate.name === 'No false accepts')?.passed).toBe(false);
});

test('an accept of the next deck card is a wrong-card accept of the card being scanned', async () => {
  nextPhotosAre(cardRecognition([shock]), cardRecognition([shock]));
  await scanCards(2);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock), metroLog());

  expect(run.summary).toMatchObject({ identityTop1: 1, correctAccepts: 1, falseAccepts: 1, wrongCardAccepts: 1 });
});

test('a second photo of a deck card is a duplicate photo, not another card', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await scanCards(3);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock), metroLog());

  expect(run.summary).toMatchObject({ presented: 2, identityTop1: 2, correctAccepts: 2, duplicatePhotos: 1, results: 3 });
});

test('a duplicate photo accepted as another printing of the same card is a false accept', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([lightningBolt2xm]), cardRecognition([shock]));
  await scanCards(3);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock), metroLog());

  expect(run.summary).toMatchObject({ correctAccepts: 2, duplicatePhotos: 1, falseAccepts: 1, wrongCardAccepts: 0 });
});

test('a photo that is not a card is counted apart, and a failed recognition counts against the card being scanned', async () => {
  nextPhotosAre(notACard(), 'unreadable_photo', cardRecognition([shock]));
  await scanCards(3);

  const run = scoreBinDeck(deckOf(lightningBoltM10, shock), metroLog());

  expect(run.summary).toMatchObject({ identityTop1: 1, correctAccepts: 1, notACardResults: 1, failures: 1, missedCards: 0 });
});

test('the run keeps the parity check from the same Metro log', async () => {
  const parity = { version: '20261012-cf1753', references: 24, lowestCosine: 0.9997, meanCosine: 1.00003, failures: [] };
  galleryParityIs(parity);
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await renderApp();
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Run the parity check' }));
  await screen.findByText('Lowest cosine 0.99970');
  await swipeDownDrawer();
  await pressTab('Scan');

  await scanACard();

  const run = scoreBinDeck(deckOf(lightningBoltM10), metroLog());
  expect(run.parity).toEqual(parity);
});

test('the end-to-end time runs from the photo request to the recognition', async () => {
  jest.useFakeTimers({ now: 1_000_000, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance'] });
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  const recognition = holdNextRecognition();
  await scanCards(1);

  await act(async () => jest.setSystemTime(Date.now() + 1_600));
  await recognition.finish();

  const run = scoreBinDeck(deckOf(lightningBoltM10), metroLog());
  expect(run.summary.endToEndP95Ms).toBeGreaterThanOrEqual(1_600);
  expect(run.gates.find((gate) => gate.name === 'End-to-end p95 below 1.5 s')?.passed).toBe(false);
});
