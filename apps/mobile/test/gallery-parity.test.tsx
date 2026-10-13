import { fireEvent, screen } from 'expo-router/testing-library';

import { galleryParityIs } from './fake-card-recognizer';
import { startSignedIn } from './fake-supabase';
import { openSettings } from './native-ui';
import { renderApp } from './render-app';

const passingParity = {
  version: '20261012-cf1753',
  references: 24,
  lowestCosine: 0.9997588396072388,
  meanCosine: 1.0000330905119579,
  failures: [],
};

function runAs(development: boolean) {
  jest.replaceProperty(globalThis as typeof globalThis & { __DEV__: boolean }, '__DEV__', development);
}

async function checkGalleryParity() {
  await renderApp();
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Check gallery parity' }));
}

function parityLogLines() {
  return jest
    .mocked(console.info)
    .mock.calls.map(([line]) => String(line))
    .filter((line) => line.startsWith('PARITY '))
    .map((line) => JSON.parse(line.slice('PARITY '.length)));
}

beforeEach(() => {
  startSignedIn();
  runAs(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('a development build checks gallery parity from settings and shows the lowest and mean cosine over the reference images', async () => {
  galleryParityIs(passingParity);

  await checkGalleryParity();

  expect(await screen.findByText('Gallery version 20261012-cf1753')).toBeOnTheScreen();
  expect(screen.getByText('Lowest cosine 0.99976')).toBeOnTheScreen();
  expect(screen.getByText('Mean cosine 1.00003')).toBeOnTheScreen();
  expect(screen.getByText('24 reference images')).toBeOnTheScreen();
});

test('the parity check logs its exact result to Metro for the gallery parity command', async () => {
  galleryParityIs(passingParity);

  await checkGalleryParity();

  await screen.findByText('Lowest cosine 0.99976');
  expect(parityLogLines()).toEqual([passingParity]);
});

test('a reference image that could not be checked is listed under the result', async () => {
  galleryParityIs({
    ...passingParity,
    references: 23,
    failures: ['bolt-m10: imageDownload(404)'],
  });

  await checkGalleryParity();

  expect(await screen.findByText('23 reference images')).toBeOnTheScreen();
  expect(screen.getByText('bolt-m10: imageDownload(404)')).toBeOnTheScreen();
});

test('without an installed gallery, the parity check says it could not check', async () => {
  galleryParityIs('gallery_not_ready');

  await checkGalleryParity();

  expect(await screen.findByText('Could not check gallery parity: gallery_not_ready')).toBeOnTheScreen();
});

test('a production build has no gallery parity check in settings', async () => {
  runAs(false);
  await renderApp();

  await openSettings();

  expect(screen.getByText('Scan sounds')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Check gallery parity' })).not.toBeOnTheScreen();
});
