export const galleryBucket = 'gallery';
export const pointerFile = 'published.json';
export const manifestFile = 'manifest.json';
export const galleryFormatVersion = 2;

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

export type PartKind = 'gallery' | 'printing_list';

export type PrintingListRow = {
  id: string;
  oracleId: string;
  illustrationId: string | null;
  name: string;
  faceNames: string[];
  set: string;
  collectorNumber: string;
  frame: string;
  finishes: string[];
  basicLand: boolean;
};

export type ManifestPart = {
  name: string;
  kind: PartKind;
  addOn: number;
  firstRow: number;
  rowCount: number;
  compressedBytes: number;
  rawBytes: number;
  sha256: string;
};

export type FeaturePrintModel = {
  name: string;
  sha256?: string;
  inputSize: { width: number; height: number };
  vectorSize: number;
};

export type RecognizerThresholds = {
  notACard: number;
  orientationMargin: number;
  artMargin: number;
};

export type BuiltWith = {
  macOS: string;
  recognizerCommit: string;
  machine: string;
};

export type Manifest = {
  formatVersion: number;
  version: string;
  builtAt: string;
  model: FeaturePrintModel;
  thresholds: RecognizerThresholds;
  encoding: { type: 'int8'; scale: 'per_vector' };
  rows: number;
  scryfallSnapshot: string;
  cardCatalogSnapshot: string;
  builtWith: BuiltWith;
  parts: ManifestPart[];
};

export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
