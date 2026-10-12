import { fireEvent, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import type { DetectionSample, FrameQuad } from '../modules/card-detector';
import {
  cameraAccessIs,
  cameraIsOn,
  cameraPrompts,
  failNextPhotos,
  phoneHasNoCamera,
  photosDeleted,
  photosTaken,
  showSamples,
  userAnswersCameraPrompt,
} from './fake-card-detector';
import { startSignedIn } from './fake-supabase';
import { pressTab, selectedTab } from './native-ui';
import { renderApp } from './render-app';

const sampleIntervalMs = 200;

function quad(left: number, top: number, right: number, bottom: number): FrameQuad {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function cardSignature(seed: number) {
  return Array.from({ length: 48 }, (_, index) =>
    Math.round(128 + 100 * Math.sin(seed * 1.7 + index * (0.9 + seed * 0.13))),
  );
}

type SampleShape = Omit<DetectionSample, 'sampledAtMs'>;

function card({ offset = 0, seed = 1 }: { offset?: number; seed?: number } = {}): SampleShape {
  return {
    detected: true,
    corners: quad(0.2 + offset, 0.2, 0.8 + offset, 0.8),
    proposalDetected: true,
    proposalCorners: quad(0.25, 0.25, 0.75, 0.75),
    confidence: 0.9,
    areaRatio: 0.36,
    aspectRatio: 63 / 88,
    edgeSupportMin: 0.8,
    signature: cardSignature(seed),
    frameWidth: 720,
    frameHeight: 1280,
    nativeDurationMs: 14,
    runtimeErrorCode: null,
  };
}

function noCard({
  proposal = null,
  confidence = 0,
}: { proposal?: FrameQuad | null; confidence?: number } = {}): SampleShape {
  return {
    detected: false,
    corners: null,
    proposalDetected: proposal !== null,
    proposalCorners: proposal,
    confidence,
    areaRatio: 0,
    aspectRatio: 0,
    edgeSupportMin: 0,
    signature: [],
    frameWidth: 720,
    frameHeight: 1280,
    nativeDurationMs: 12,
    runtimeErrorCode: null,
  };
}

const emptySurface = () => noCard({ proposal: quad(0.01, 0.01, 0.99, 0.99), confidence: 0.57 });

function repeat(count: number, sample: () => SampleShape) {
  return Array.from({ length: count }, sample);
}

let clockMs = 0;

function timed(samples: SampleShape[]): DetectionSample[] {
  return samples.map((sample) => {
    clockMs += sampleIntervalMs;
    return { ...sample, sampledAtMs: clockMs };
  });
}

async function scan(samples: SampleShape[]) {
  await showSamples(timed(samples));
}

async function openScan() {
  await renderApp();
  await pressTab('Scan');
}

beforeEach(() => {
  clockMs = 0;
  startSignedIn();
});

test('an empty surface takes no photo', async () => {
  await openScan();

  await scan(repeat(50, emptySurface));

  expect(photosTaken()).toBe(0);
});

test('a still card takes one photo once it has been steady for 400 ms', async () => {
  await openScan();

  await scan(repeat(3, card));
  expect(photosTaken()).toBe(0);

  await scan(repeat(1, card));
  expect(photosTaken()).toBe(1);
});

test('a moving card takes no photo', async () => {
  await openScan();

  await scan(Array.from({ length: 20 }, (_, index) => card({ offset: (index % 2) * 0.05 })));

  expect(photosTaken()).toBe(0);
});

test('a card held still for 30 seconds takes one photo', async () => {
  await openScan();

  await scan(repeat(150, card));

  expect(photosTaken()).toBe(1);
});

test('capture re-arms after the card has been gone for 1 second', async () => {
  await openScan();

  await scan([
    ...repeat(6, card),
    ...repeat(6, emptySurface),
    ...repeat(6, () => card({ offset: 0.02 })),
    ...repeat(6, emptySurface),
    ...repeat(6, card),
  ]);

  expect(photosTaken()).toBe(3);
});

test('capture does not re-arm when the card is gone for less than 1 second', async () => {
  await openScan();

  await scan([...repeat(6, card), ...repeat(4, emptySurface), ...repeat(6, card)]);

  expect(photosTaken()).toBe(1);
});

const refinementFlicker = () => noCard({ proposal: quad(0.25, 0.25, 0.75, 0.75), confidence: 0.95 });

test('a card whose outline flickers takes one photo', async () => {
  await openScan();

  await scan([...repeat(4, card), ...repeat(4, refinementFlicker), ...repeat(20, card)]);

  expect(photosTaken()).toBe(1);
});

test('a partly hidden card still counts as the same card', async () => {
  const partlyHidden = () => noCard({ proposal: quad(0.35, 0.4, 0.65, 0.73), confidence: 0.76 });
  await openScan();

  await scan([...repeat(6, card), ...repeat(6, partlyHidden), ...repeat(10, card)]);

  expect(photosTaken()).toBe(1);
});

test('a different card laid on the last one takes a new photo', async () => {
  await openScan();

  await scan([
    ...repeat(6, () => card({ seed: 1 })),
    ...repeat(3, refinementFlicker),
    ...repeat(12, () => card({ seed: 2 })),
    ...repeat(3, refinementFlicker),
    ...repeat(12, () => card({ seed: 3 })),
  ]);

  expect(photosTaken()).toBe(3);
});

test('the same card under changing light takes one photo', async () => {
  await openScan();

  await scan(
    Array.from({ length: 36 }, (_, index) => ({
      ...card(),
      signature: cardSignature(1).map((value, cell) =>
        Math.max(0, Math.min(255, value + (index % 2 ? ((cell * 37) % 11) - 5 : 0))),
      ),
    })),
  );

  expect(photosTaken()).toBe(1);
});

test('a hand over the card does not re-arm capture', async () => {
  await openScan();

  await scan([...repeat(6, card), ...repeat(20, refinementFlicker), ...repeat(6, card)]);

  expect(photosTaken()).toBe(1);
});

test('a second copy of the same card takes a photo only after the first one leaves', async () => {
  await openScan();

  await scan([...repeat(6, card), ...repeat(3, refinementFlicker), ...repeat(12, card)]);
  expect(photosTaken()).toBe(1);

  await scan([...repeat(6, emptySurface), ...repeat(6, card)]);
  expect(photosTaken()).toBe(2);
});

async function pause(ms: number) {
  clockMs += ms;
}

const darkFrame = () => noCard();

test('a pause while the card leaves does not take the same card again', async () => {
  await openScan();

  await scan([...repeat(6, card), ...repeat(3, emptySurface)]);
  await pause(28_000);
  await scan([...repeat(3, darkFrame), ...repeat(10, card)]);

  expect(photosTaken()).toBe(1);
});

test('a pause during a hold starts the hold again', async () => {
  await openScan();

  await scan(repeat(3, card));
  await pause(10_000);
  await scan(repeat(1, card));
  expect(photosTaken()).toBe(0);

  await scan(repeat(3, card));
  expect(photosTaken()).toBe(1);
});

test('a failed photo is taken again after a fresh hold', async () => {
  failNextPhotos(1);
  await openScan();

  await scan(repeat(4, card));
  expect(photosTaken()).toBe(0);

  await scan(repeat(4, card));
  expect(photosTaken()).toBe(1);
});

test('three failed photos in a row stop the camera until Try again', async () => {
  failNextPhotos(3);
  await openScan();

  await scan(repeat(12, card));

  const scanTab = within(selectedTab());
  expect(scanTab.getByText('Camera stopped.')).toBeOnTheScreen();
  expect(cameraIsOn()).toBe(false);

  await fireEvent.press(scanTab.getByRole('button', { name: 'Try again' }));

  expect(scanTab.queryByText('Camera stopped.')).not.toBeOnTheScreen();
  expect(cameraIsOn()).toBe(true);
  await scan(repeat(4, card));
  expect(photosTaken()).toBe(1);
});

test('a detector error stops the camera', async () => {
  await openScan();

  await scan([...repeat(2, card), { ...card(), runtimeErrorCode: 'vision_failed' }, ...repeat(6, card)]);

  expect(within(selectedTab()).getByText('Camera stopped.')).toBeOnTheScreen();
  expect(photosTaken()).toBe(0);
});

test('a photo is deleted from the phone after it is taken', async () => {
  await openScan();

  await scan(repeat(4, card));

  expect(photosDeleted()).toEqual(['file:///tmp/scan-1.jpg']);
});

test('the camera stops when the user leaves the Scan tab', async () => {
  await openScan();
  expect(cameraIsOn()).toBe(true);

  await pressTab('Collection');

  expect(cameraIsOn()).toBe(false);
});

test('the Scan tab asks for camera access the first time and shows the camera once it is allowed', async () => {
  cameraAccessIs('undetermined');
  userAnswersCameraPrompt('granted');

  await openScan();

  expect(cameraPrompts()).toBe(1);
  expect(cameraIsOn()).toBe(true);
});

test('the Scan tab says the camera is off when the user denies camera access', async () => {
  cameraAccessIs('undetermined');
  userAnswersCameraPrompt('denied');

  await openScan();

  const scanTab = within(selectedTab());
  expect(scanTab.getByText('Camera access is off.')).toBeOnTheScreen();
  expect(scanTab.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
  expect(cameraIsOn()).toBe(false);
});

test('Open Settings opens iOS Settings when camera access was denied before', async () => {
  cameraAccessIs('denied');
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await openScan();

  await fireEvent.press(within(selectedTab()).getByRole('button', { name: 'Open Settings' }));

  expect(cameraPrompts()).toBe(0);
  expect(openSettings).toHaveBeenCalledTimes(1);
});

test('the Scan tab says the camera is not available on a phone without a camera', async () => {
  phoneHasNoCamera();

  await openScan();

  expect(within(selectedTab()).getByText('Camera not available')).toBeOnTheScreen();
  expect(cameraPrompts()).toBe(0);
  expect(cameraIsOn()).toBe(false);
});

function litBySharedLight(seed: number) {
  return Array.from({ length: 48 }, (_, index) => {
    const noise = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
    const art = (noise - Math.floor(noise) - 0.5) * 50;
    const column = index % 8;
    const row = Math.floor(index / 8);
    const hotspot = 70 * Math.exp(-((column - 4) ** 2 + (row - 2) ** 2) / 6);
    return Math.max(0, Math.min(255, 70 + 12 * column + 8 * row + hotspot + art));
  });
}

test('a different card under the same light takes a new photo', async () => {
  await openScan();

  await scan([
    ...repeat(6, () => ({ ...card(), signature: litBySharedLight(1) })),
    ...repeat(3, refinementFlicker),
    ...repeat(12, () => ({ ...card(), signature: litBySharedLight(2) })),
  ]);

  expect(photosTaken()).toBe(2);
});
