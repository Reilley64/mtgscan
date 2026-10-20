import { act } from 'expo-router/testing-library';

import type {
  DecisionBasis,
  GalleryCardPrinting,
  GalleryDownload,
  GalleryDownloadStatus,
  GalleryParity,
  InstalledGallery,
  Recognition,
  RecognitionErrorCode,
} from '../modules/card-recognizer';
import { galleryPrintings } from './card-printings';
import { putFile } from './fake-file-system';
import { publishedGalleryVersion } from './fake-supabase';

type Listener = (status: GalleryDownloadStatus) => void;

export const galleryBuiltAt = '2026-10-12T09:30:00.000Z';
export const galleryModel = 'pe-core-s16-384';

let installed: InstalledGallery | null = null;
let nextRecognitions: (Recognition | RecognitionErrorCode)[] = [];
let recognizedPhotos: string[] = [];
let cardNameSearches: string[] = [];
let trainingCrops = 0;
let heldRecognition: { finish: () => void } | null = null;
let holdingNextRecognition = false;
let downloads: GalleryDownload[] = [];
let galleryParity: GalleryParity | RecognitionErrorCode = 'gallery_not_ready';
const listeners = new Set<Listener>();

export const fakeCardRecognizer = {
  recognizerVersion: '1.0.0 (7)',
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
    if (next.kind === 'card' && next.trainingCrop) {
      putFile(next.trainingCrop, 'training crop');
    }
    return next;
  },
  searchCardNames: async (text: string) => {
    cardNameSearches = [...cardNameSearches, text];
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
  checkGalleryParity: async (): Promise<GalleryParity> => {
    if (typeof galleryParity === 'string') {
      throw Object.assign(new Error(galleryParity), { code: galleryParity });
    }
    return galleryParity;
  },
  addGalleryDownloadListener: (listener: Listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

export function phoneHasGallery(version: string | null, builtAt = galleryBuiltAt, model = galleryModel) {
  installed = version ? { version, builtAt, model } : null;
}

export async function galleryDownloadReports(
  state: GalleryDownloadStatus['state'],
  {
    bytesDone = 0,
    bytesTotal = 68_500_000,
    bytesNeeded,
    version,
    builtAt = galleryBuiltAt,
    model = galleryModel,
  }: Partial<GalleryDownloadStatus> & { builtAt?: string; model?: string } = {},
) {
  const status: GalleryDownloadStatus = {
    version: version ?? downloads.at(-1)?.version ?? publishedGalleryVersion,
    state,
    bytesDone,
    bytesTotal,
    ...(bytesNeeded === undefined ? {} : { bytesNeeded }),
  };
  if (state === 'installed') {
    installed = { version: status.version, builtAt, model };
  }
  await act(async () => {
    listeners.forEach((listener) => listener(status));
  });
}

export function cardRecognition(
  candidates: GalleryCardPrinting[],
  {
    premiumMark = false,
    accepted = true,
    basis = 'collector_line',
    sameTextTwinCount = 0,
    artMargin = 0.12,
    trainingCrop = `file:///caches/training-crops/crop-${(trainingCrops += 1)}.jpg`,
  }: {
    premiumMark?: boolean;
    accepted?: boolean;
    basis?: DecisionBasis;
    sameTextTwinCount?: number;
    artMargin?: number | null;
    trainingCrop?: string | null;
  } = {},
): Recognition {
  return {
    kind: 'card',
    candidates,
    decision: accepted ? { accepted, basis, reasons: [] } : { accepted, basis: null, reasons: [] },
    reading: { setCode: candidates[0]?.setCode, collectorNumber: candidates[0]?.collectorNumber, premiumMark },
    sameTextTwinCount,
    topSimilarity: 0.9,
    artMargin,
    rotation: 0,
    trainingCrop,
    stageMs: {},
  };
}

export function notACard(): Recognition {
  return { kind: 'not_a_card', topSimilarity: 0.3, stageMs: {} };
}

export function galleryParityIs(parity: GalleryParity | RecognitionErrorCode) {
  galleryParity = parity;
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

export function cardNameSearchesSent() {
  return cardNameSearches;
}

export function galleryDownloads() {
  return downloads;
}

export function resetFakeCardRecognizer() {
  installed = { version: publishedGalleryVersion, builtAt: galleryBuiltAt, model: galleryModel };
  downloads = [];
  galleryParity = 'gallery_not_ready';
  listeners.clear();
  nextRecognitions = [];
  recognizedPhotos = [];
  cardNameSearches = [];
  trainingCrops = 0;
  heldRecognition = null;
  holdingNextRecognition = false;
}
