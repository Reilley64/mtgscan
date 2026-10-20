import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { returnToTheApp } from './app-state';
import { cameraIsOn } from './fake-card-detector';
import { galleryDownloadReports, galleryDownloads, phoneHasGallery } from './fake-card-recognizer';
import { galleryPartNames, publishedGalleryVersion, publishGallery, startSignedIn, uploadUnpublishedGallery } from './fake-supabase';
import { fail } from './fake-supabase-controls';
import { openSettings, pressTab, selectedTab } from './native-ui';
import { renderApp } from './render-app';

const newerVersion = '20261109-a1b2c3';

async function openScan() {
  await renderApp();
  await pressTab('Scan');
  return selectedTab();
}

async function press(button: ReturnType<typeof screen.getByRole>) {
  await fireEvent.press(button);
  await act(async () => {});
}

beforeEach(() => {
  startSignedIn();
});

describe('on a phone without the gallery', () => {
  beforeEach(() => {
    phoneHasGallery(null);
  });

  test('the app downloads the published gallery version on Wi-Fi only, with a signed URL for every part', async () => {
    uploadUnpublishedGallery(newerVersion);

    await renderApp();

    expect(galleryDownloads()).toHaveLength(1);
    const [download] = galleryDownloads();
    expect(download!.version).toBe(publishedGalleryVersion);
    expect(JSON.parse(download!.manifest).version).toBe(publishedGalleryVersion);
    expect(Object.keys(download!.urls).sort()).toEqual([...galleryPartNames].sort());
    expect(download!.urls['base-gallery-1.zlib']).toContain(`${publishedGalleryVersion}/base-gallery-1.zlib`);
    expect(download!.allowsCellularAccess).toBe(false);
  });

  test('the Scan tab shows "Downloading gallery" with what the gallery is for and the progress, and the camera stays off', async () => {
    const tab = await openScan();

    await galleryDownloadReports('downloading', { bytesDone: 12_300_000, bytesTotal: 68_500_000 });

    expect(within(tab).getByText('Downloading gallery')).toBeOnTheScreen();
    expect(
      within(tab).getByText('The scanner needs the gallery to recognize cards. It downloads once. Updates come in the background.'),
    ).toBeOnTheScreen();
    expect(within(tab).getByRole('progressbar', { name: 'Downloading gallery' })).toHaveAccessibilityValue({
      min: 0,
      max: 68_500_000,
      now: 12_300_000,
    });
    expect(within(tab).getByText('12.3 MB of 68.5 MB')).toBeOnTheScreen();
    expect(cameraIsOn()).toBe(false);
  });

  test('the Scan tab shows "Waiting for Wi-Fi" with what the gallery is for, and Download now downloads on mobile data', async () => {
    const tab = await openScan();
    await galleryDownloadReports('waiting_for_wifi', { bytesDone: 0 });
    expect(within(tab).getByText('Waiting for Wi-Fi')).toBeOnTheScreen();
    expect(within(tab).getByText('The scanner needs the gallery to recognize cards. It downloads once. Updates come in the background.')).toBeOnTheScreen();

    await press(within(tab).getByRole('button', { name: 'Download now' }));

    expect(galleryDownloads().at(-1)).toMatchObject({ version: publishedGalleryVersion, allowsCellularAccess: true });
    await galleryDownloadReports('downloading', { bytesDone: 1_000_000 });
    expect(within(tab).getByText('Downloading gallery')).toBeOnTheScreen();
  });

  test('the camera starts when the gallery is ready', async () => {
    const tab = await openScan();
    await galleryDownloadReports('downloading', { bytesDone: 68_500_000 });
    expect(cameraIsOn()).toBe(false);

    await galleryDownloadReports('installed');

    expect(within(tab).queryByText('Downloading gallery')).not.toBeOnTheScreen();
    expect(cameraIsOn()).toBe(true);
  });

  test('a failed download shows Try again, and Try again downloads again', async () => {
    const tab = await openScan();

    await galleryDownloadReports('failed', { bytesDone: 30_000_000 });

    expect(within(tab).getByText('Gallery download did not work.')).toBeOnTheScreen();
    expect(cameraIsOn()).toBe(false);
    await press(within(tab).getByRole('button', { name: 'Try again' }));
    expect(galleryDownloads()).toHaveLength(2);
    await galleryDownloadReports('downloading', { bytesDone: 30_000_000 });
    expect(within(tab).getByText('Downloading gallery')).toBeOnTheScreen();
  });

  test('a download that lost the network shows that it is paused', async () => {
    const tab = await openScan();

    await galleryDownloadReports('waiting_for_network', { bytesDone: 30_000_000 });

    expect(within(tab).getByText('Gallery download paused. It continues when you are online.')).toBeOnTheScreen();
  });

  test('with no network the gallery check is paused, and Try again checks again', async () => {
    fail('gallery.download', 1);
    const tab = await openScan();

    expect(within(tab).getByText('Gallery download paused. It continues when you are online.')).toBeOnTheScreen();
    expect(galleryDownloads()).toHaveLength(0);

    await press(within(tab).getByRole('button', { name: 'Try again' }));

    expect(galleryDownloads()).toHaveLength(1);
  });

  test('a paused gallery check runs again when the app comes back to the foreground', async () => {
    fail('gallery.download', 1);
    await openScan();
    expect(galleryDownloads()).toHaveLength(0);

    await returnToTheApp();
    await act(async () => {});

    expect(galleryDownloads()).toHaveLength(1);
  });

  test('a published gallery version whose format this build does not know downloads nothing, and shows Try again', async () => {
    publishGallery(newerVersion, { formatVersion: 3 });
    const tab = await openScan();

    expect(within(tab).getByText('Gallery download did not work.')).toBeOnTheScreen();
    expect(cameraIsOn()).toBe(false);
    await press(within(tab).getByRole('button', { name: 'Try again' }));
    expect(galleryDownloads()).toHaveLength(0);
  });

  test('a phone without enough space says how much the gallery needs', async () => {
    const tab = await openScan();

    await galleryDownloadReports('not_enough_space', { bytesNeeded: 269_400_000 });

    expect(
      within(tab).getByText('Not enough space for the gallery. It needs 269.4 MB.'),
    ).toBeOnTheScreen();
    expect(within(tab).getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});

describe('on a phone with the gallery', () => {
  test('the published gallery version that is installed downloads nothing', async () => {
    await renderApp();

    await openSettings();

    expect(galleryDownloads()).toHaveLength(0);
    expect(screen.getByText('12 October 2026')).toBeOnTheScreen();
    expect(screen.getByText('Up to date')).toBeOnTheScreen();
  });

  test('a newer published gallery version downloads while scanning goes on, and the app switches when it is installed', async () => {
    publishGallery(newerVersion);
    const tab = await openScan();

    expect(galleryDownloads().map((download) => download.version)).toEqual([newerVersion]);
    await galleryDownloadReports('downloading', { bytesDone: 400_000, bytesTotal: 1_200_000 });
    expect(cameraIsOn()).toBe(true);
    expect(within(tab).queryByText('Downloading gallery')).not.toBeOnTheScreen();
    await pressTab('Recent');
    await openSettings();
    expect(screen.getByText('12 October 2026')).toBeOnTheScreen();
    expect(screen.getByText('Downloading')).toBeOnTheScreen();

    await galleryDownloadReports('installed', { builtAt: '2026-11-09T08:00:00.000Z' });

    expect(screen.getByText('9 November 2026')).toBeOnTheScreen();
    expect(screen.getByText('Up to date')).toBeOnTheScreen();
  });

  test('a newer gallery version whose format this build does not know downloads nothing, and scanning goes on', async () => {
    publishGallery(newerVersion, { formatVersion: 3 });
    await openScan();

    expect(galleryDownloads()).toHaveLength(0);
    expect(cameraIsOn()).toBe(true);
    await pressTab('Recent');
    await openSettings();
    expect(screen.getByText('12 October 2026')).toBeOnTheScreen();
    expect(screen.getByText('Up to date')).toBeOnTheScreen();
  });

  test('a gallery update that waits for Wi-Fi shows the gallery as paused in settings', async () => {
    publishGallery(newerVersion);
    await renderApp();
    await galleryDownloadReports('waiting_for_wifi');

    await openSettings();

    expect(screen.getByText('Paused')).toBeOnTheScreen();
  });
});
