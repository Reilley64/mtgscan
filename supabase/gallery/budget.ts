import { partBytes } from './format';
import { type Manifest, megabytes } from './manifest';

export const freePlan = {
  storageBytes: 1_000_000_000,
  egressBytes: 5_000_000_000,
  uploadBytes: 50_000_000,
};

export function gigabytes(bytes: number): string {
  return `${bytes / 1_000_000_000} GB`;
}

function versionSize(manifest: Manifest): string {
  const largest = Math.max(...manifest.parts.map((part) => part.compressedBytes));
  return [
    `Gallery version ${manifest.version}: ${manifest.rows} rows, ${megabytes(partBytes(manifest.parts))} in ${manifest.parts.length} parts`,
    `(gallery ${megabytes(partBytes(manifest.parts, 'gallery'))}, printing list ${megabytes(partBytes(manifest.parts, 'printing_list'))}, model ${megabytes(partBytes(manifest.parts, 'model'))}).`,
    `The largest part is ${megabytes(largest)} of the ${megabytes(freePlan.uploadBytes)} upload limit.`,
  ].join(' ');
}

export function budgetReport(manifest: Manifest, keptVersions: Manifest[], updateBytes: number | null): string[] {
  const install = partBytes(manifest.parts);
  const stored = keptVersions.reduce((sum, kept) => sum + partBytes(kept.parts), 0);
  return [
    versionSize(manifest),
    `A full install downloads ${megabytes(install)}. ${gigabytes(freePlan.egressBytes)} of egress a month covers ${Math.floor(freePlan.egressBytes / install)} full installs with nothing else.`,
    ...(updateBytes === null ? [] : [`A phone with the published version downloads ${megabytes(updateBytes)} to update.`]),
    `Storage for the kept versions (${keptVersions.map((kept) => kept.version).join(', ')}) is ${megabytes(stored)} of ${gigabytes(freePlan.storageBytes)}.`,
    `About ${megabytes(freePlan.storageBytes - stored)} is left for training crops.`,
  ];
}
