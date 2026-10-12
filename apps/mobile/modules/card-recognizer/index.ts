import { NativeModule, requireNativeModule } from 'expo';

import type { GalleryDownload, GalleryDownloadStatus, InstalledGallery } from './src/gallery';
import type { CardOutline, Recognition } from './src/recognition';

export type * from './src/gallery';
export type * from './src/recognition';

type CardRecognizerEvents = {
  onGalleryDownload(status: GalleryDownloadStatus): void;
};

declare class CardRecognizerModule extends NativeModule<CardRecognizerEvents> {
  recognize(photoUri: string, outline: CardOutline): Promise<Recognition>;
  installedGallery(): Promise<InstalledGallery | null>;
  galleryDownloadStatus(): Promise<GalleryDownloadStatus | null>;
  downloadGallery(download: GalleryDownload): Promise<void>;
}

const cardRecognizer = requireNativeModule<CardRecognizerModule>('CardRecognizer');

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
