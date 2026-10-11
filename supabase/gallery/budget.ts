import { type Manifest, partBytes } from './format';

export const freePlan = {
  storageBytes: 1_000_000_000,
  egressBytes: 5_000_000_000,
  uploadBytes: 50_000_000,
};

export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function versionSize(manifest: Manifest): string {
  const largest = Math.max(...manifest.parts.map((part) => part.compressedBytes));
  return [
    `Gallery version ${manifest.version}: ${manifest.rows} rows, ${megabytes(partBytes(manifest.parts))} in ${manifest.parts.length} parts`,
    `(gallery ${megabytes(partBytes(manifest.parts, 'gallery'))}, printing list ${megabytes(partBytes(manifest.parts, 'printing_list'))}).`,
    `The largest part is ${megabytes(largest)} of the ${megabytes(freePlan.uploadBytes)} upload limit.`,
  ].join(' ');
}

export function budgetReport(manifest: Manifest, keptVersions: Manifest[], updateBytes: number | null): string[] {
  const install = partBytes(manifest.parts);
  const stored = keptVersions.reduce((sum, kept) => sum + partBytes(kept.parts), 0);
  return [
    versionSize(manifest),
    `A full install downloads ${megabytes(install)}. 5 GB of egress a month covers ${Math.floor(freePlan.egressBytes / install)} full installs with nothing else.`,
    ...(updateBytes === null ? [] : [`A phone with the published version downloads ${megabytes(updateBytes)} to update.`]),
    `Storage for the kept versions (${keptVersions.map((kept) => kept.version).join(', ')}) is ${megabytes(stored)} of 1 GB.`,
    `About ${megabytes(freePlan.storageBytes - stored)} is left for training crops.`,
  ];
}
