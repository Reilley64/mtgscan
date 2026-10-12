export const galleryBucket = 'gallery';
export const pointerFile = 'published.json';
export const manifestFile = 'manifest.json';

export type Pointer = {
  formatVersion: number;
  version: string;
  manifest: string;
  publishedAt: string;
};

export type SignedVersion = {
  version: string;
  expiresAt: string;
  manifest: string;
  parts: Record<string, string>;
};
