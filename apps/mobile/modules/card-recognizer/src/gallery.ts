export type InstalledGallery = {
  version: string;
  builtAt: string;
};

export type GalleryDownloadState =
  | 'downloading'
  | 'waiting_for_wifi'
  | 'waiting_for_network'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'not_enough_space';

export type GalleryDownloadStatus = {
  version: string;
  state: GalleryDownloadState;
  bytesDone: number;
  bytesTotal: number;
  bytesNeeded?: number;
  reason?: string;
};

export type GalleryDownload = {
  version: string;
  manifest: string;
  urls: Record<string, string>;
  allowsCellularAccess: boolean;
};
