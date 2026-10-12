import { act } from 'expo-router/testing-library';

import type {
  GalleryCardPrinting,
  GalleryDownload,
  GalleryDownloadStatus,
  InstalledGallery,
  Recognition,
  RecognitionErrorCode,
} from '../modules/card-recognizer';
import { galleryPrintings } from './card-printings';
import { publishedGalleryVersion } from './fake-supabase';

type Listener = (status: GalleryDownloadStatus) => void;

export const galleryBuiltAt = '2026-10-12T09:30:00.000Z';

let installed: InstalledGallery | null = null;
let nextRecognitions: (Recognition | RecognitionErrorCode)[] = [];
let recognizedPhotos: string[] = [];
let heldRecognition: { finish: () => void } | null = null;
let holdingNextRecognition = false;
let downloads: GalleryDownload[] = [];
const listeners = new Set<Listener>();

export const fakeCardRecognizer = {
  recognize: async (photoUri: string): Promise<Recognition> => {
    recognizedPhotos = [...recognizedPhotos, photoUri];
    if (holdingNextRecognition) {
      holdingNextRecognition = false;
      await new Promise<void>((resolve) => {
        heldRecognition = { finish: resolve };
      });
    }
    const next = nextRecognitions.shift() ?? notACard();
    if (typeof next === 'string') {
      throw Object.assign(new Error(next), { code: next });
    }
    return next;
  },
  searchCardNames: async (text: string) => {
    const query = text.trim().toLowerCase();
    const names = new Map(
      galleryPrintings
        .filter((printing) => query && printing.name.toLowerCase().includes(query))
        .map((printing) => [printing.oracleId, { oracleId: printing.oracleId, name: printing.name }]),
    );
    return [...names.values()].slice(0, 10);
  },
  cardPrintings: async (oracleId: string) =>
    galleryPrintings.filter((printing) => printing.oracleId === oracleId).reverse(),
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

export function cardRecognition(
  candidates: GalleryCardPrinting[],
  { premiumMark = false, accepted = true }: { premiumMark?: boolean; accepted?: boolean } = {},
): Recognition {
  return {
    kind: 'card',
    candidates,
    decision: { accepted, reasons: [] },
    reading: { setCode: candidates[0]?.setCode, collectorNumber: candidates[0]?.collectorNumber, premiumMark },
    sameTextTwinCount: 0,
    topSimilarity: 0.9,
    rotation: 0,
    stageMs: {},
  };
}

export function notACard(): Recognition {
  return { kind: 'not_a_card', topSimilarity: 0.3, stageMs: {} };
}

export function nextPhotosAre(...recognitions: (Recognition | RecognitionErrorCode)[]) {
  nextRecognitions = [...nextRecognitions, ...recognitions];
}

export function holdNextRecognition() {
  holdingNextRecognition = true;
  return {
    finish: async () => {
      await act(async () => heldRecognition?.finish());
    },
  };
}

export function photosRecognized() {
  return recognizedPhotos;
}

export function galleryDownloads() {
  return downloads;
}

export function resetFakeCardRecognizer() {
  installed = { version: publishedGalleryVersion, builtAt: galleryBuiltAt };
  downloads = [];
  listeners.clear();
  nextRecognitions = [];
  recognizedPhotos = [];
  heldRecognition = null;
  holdingNextRecognition = false;
}
