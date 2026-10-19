import { NativeModule, requireNativeModule } from 'expo';

import type { GalleryDownload, GalleryDownloadStatus, GalleryParity, InstalledGallery } from './src/gallery';
import type { CardName, CardOutline, GalleryCardPrinting, Recognition } from './src/recognition';

export type * from './src/gallery';
export type * from './src/recognition';

type CardRecognizerEvents = {
  onGalleryDownload(status: GalleryDownloadStatus): void;
};

declare class CardRecognizerModule extends NativeModule<CardRecognizerEvents> {
  readonly featurePrintRevision: number;
  readonly recognizerVersion: string;
  recognize(photoUri: string, outline: CardOutline): Promise<Recognition>;
  installedGallery(): Promise<InstalledGallery | null>;
  galleryDownloadStatus(): Promise<GalleryDownloadStatus | null>;
  downloadGallery(download: GalleryDownload): Promise<void>;
  searchCardNames(text: string): Promise<CardName[]>;
  cardPrintings(oracleId: string): Promise<GalleryCardPrinting[]>;
  checkGalleryParity(): Promise<GalleryParity>;
}

const cardRecognizer = requireNativeModule<CardRecognizerModule>('CardRecognizer');

export const featurePrintRevision = cardRecognizer.featurePrintRevision;

export const recognizerVersion = cardRecognizer.recognizerVersion;

export function recognize(photoUri: string, outline: CardOutline): Promise<Recognition> {
  return cardRecognizer.recognize(photoUri, outline);
}

export function installedGallery(): Promise<InstalledGallery | null> {
  return cardRecognizer.installedGallery();
}

export function galleryDownloadStatus(): Promise<GalleryDownloadStatus | null> {
  return cardRecognizer.galleryDownloadStatus();
}

export function downloadGallery(download: GalleryDownload): Promise<void> {
  return cardRecognizer.downloadGallery(download);
}

export function addGalleryDownloadListener(listener: (status: GalleryDownloadStatus) => void) {
  return cardRecognizer.addListener('onGalleryDownload', listener);
}

export function searchCardNames(text: string): Promise<CardName[]> {
  return cardRecognizer.searchCardNames(text);
}

export function cardPrintings(oracleId: string): Promise<GalleryCardPrinting[]> {
  return cardRecognizer.cardPrintings(oracleId);
}

export function checkGalleryParity(): Promise<GalleryParity> {
  return cardRecognizer.checkGalleryParity();
}
