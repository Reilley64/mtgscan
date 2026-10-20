export type InstalledGallery = {
  version: string;
  builtAt: string;
  model: string;
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
};

export type GalleryDownload = {
  version: string;
  manifest: string;
  urls: Record<string, string>;
  allowsCellularAccess: boolean;
};

export type GalleryParity = {
  version?: string;
  references: number;
  lowestCosine: number;
  meanCosine: number;
  failures: string[];
};
