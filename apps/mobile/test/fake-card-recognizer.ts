import { act } from 'expo-router/testing-library';

import type { GalleryDownload, GalleryDownloadStatus, InstalledGallery } from '../modules/card-recognizer';
import { publishedGalleryVersion } from './fake-supabase';

type Listener = (status: GalleryDownloadStatus) => void;

export const galleryBuiltAt = '2026-10-12T09:30:00.000Z';

let installed: InstalledGallery | null = null;
let downloads: GalleryDownload[] = [];
const listeners = new Set<Listener>();

export const fakeCardRecognizer = {
  recognize: async () => {
    throw new Error('The fake recognizer does not recognize cards yet');
  },
  installedGallery: async () => installed,
  galleryDownloadStatus: async () => null,
  downloadGallery: async (download: GalleryDownload) => {
    downloads = [...downloads, download];
  },
  addGalleryDownloadListener: (listener: Listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

export function phoneHasGallery(version: string | null, builtAt = galleryBuiltAt) {
  installed = version ? { version, builtAt } : null;
}

export async function galleryDownloadReports(
  state: GalleryDownloadStatus['state'],
  {
    bytesDone = 0,
    bytesTotal = 68_500_000,
    bytesNeeded,
    version,
    builtAt = galleryBuiltAt,
  }: Partial<GalleryDownloadStatus> & { builtAt?: string } = {},
) {
  const status: GalleryDownloadStatus = {
    version: version ?? downloads.at(-1)?.version ?? publishedGalleryVersion,
    state,
    bytesDone,
    bytesTotal,
    ...(bytesNeeded === undefined ? {} : { bytesNeeded }),
  };
  if (state === 'installed') {
    installed = { version: status.version, builtAt };
  }
  await act(async () => {
    listeners.forEach((listener) => listener(status));
  });
}

export function galleryDownloads() {
  return downloads;
}

export function resetFakeCardRecognizer() {
  installed = { version: publishedGalleryVersion, builtAt: galleryBuiltAt };
  downloads = [];
  listeners.clear();
}
