import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportClient } from '../import/import-run';
import { budgetReport, megabytes } from './budget';
import { localPartBytes, versionDirectory } from './build';
import { type Manifest, verifiedPartBytes, partBytes } from './format';
import type { Recognizer } from './recognizer';
import { evidenceVersion } from './repository';
import {
  GalleryRefused,
  type Pointer,
  downloadObject,
  forgetVersion,
  manifestFile,
  markPublished,
  pointerFile,
  publishedVersions,
  recordParity,
  recordedVersions,
  removeVersionFolder,
  storedVersionFolders,
  uploadObject,
} from './storage';

export async function recordParityCheck(
  client: ImportClient,
  version: string,
  parity: { lowestCosine: number; meanCosine: number; references: number },
) {
  await recordParity(client, version, parity);
  const passed = parity.lowestCosine >= 0.98 && parity.references >= 24;
  console.log(
    `Recorded the parity check of gallery version ${version}: lowest cosine ${parity.lowestCosine}, mean ${parity.meanCosine}, over ${parity.references} references. ${passed ? 'It passes.' : 'It does not pass, so the version cannot be published.'}`,
  );
}

export async function publishGallery(client: ImportClient, version: string) {
  const publishedAt = await markPublished(client, version);
  const pointer: Pointer = {
    formatVersion: 1,
    version,
    manifest: `${version}/${manifestFile}`,
    publishedAt,
  };
  await uploadObject(client, pointerFile, new TextEncoder().encode(JSON.stringify(pointer)), 'application/json', true);
  const versions = await recordedVersions(client);
  const [current, previous] = publishedVersions(versions);
  const evidence = await evidenceVersion();
  const keep = new Set([current?.version, previous?.version, evidence].filter((kept): kept is string => !!kept));
  const deleted: string[] = [];
  for (const folder of await storedVersionFolders(client)) {
    if (!keep.has(folder)) {
      await removeVersionFolder(client, folder);
      deleted.push(folder);
    }
  }
  for (const recorded of versions) {
    if (!keep.has(recorded.version)) {
      await forgetVersion(client, recorded.version);
      if (!deleted.includes(recorded.version)) {
        deleted.push(recorded.version);
      }
    }
  }
  console.log(`Published gallery version ${version}.`);
  console.log(deleted.length > 0 ? `Deleted gallery versions ${deleted.join(', ')}.` : 'Deleted no gallery versions.');
  const kept = versions.filter((recorded) => keep.has(recorded.version)).map((recorded) => recorded.manifest);
  const updateBytes = previous
    ? current!.manifest.parts
        .filter((part) => !previous.manifest.parts.some((earlier) => earlier.sha256 === part.sha256))
        .reduce((sum, part) => sum + part.compressedBytes, 0)
    : null;
  for (const line of budgetReport(current!.manifest, kept, updateBytes)) {
    console.log(line);
  }
}

export async function galleryStatus(client: ImportClient) {
  const versions = await recordedVersions(client);
  const [current] = publishedVersions(versions);
  const evidence = await evidenceVersion();
  if (versions.length === 0) {
    console.log('No gallery version is recorded.');
    return;
  }
  for (const recorded of versions) {
    const parity =
      recorded.parity_checked_at === null
        ? 'no parity check'
        : `parity lowest ${recorded.parity_lowest_cosine} over ${recorded.parity_references}`;
    const marks = [
      recorded.version === current?.version ? 'published' : recorded.published_at ? 'published before' : 'not published',
      ...(recorded.version === evidence ? ['named by the scanner evidence pack'] : []),
    ];
    console.log(
      `${recorded.version}: ${recorded.manifest.rows} rows, ${megabytes(partBytes(recorded.manifest.parts))}, ${parity}, ${marks.join(', ')}.`,
    );
  }
  const stored = versions.reduce((sum, recorded) => sum + partBytes(recorded.manifest.parts), 0);
  console.log(`Storage for all recorded versions: ${megabytes(stored)} of 1 GB.`);
}

export async function installGallery(
  client: ImportClient,
  recognizer: Recognizer,
  workDirectory: string,
  version: string,
  galleryDirectory: string,
) {
  const directory = versionDirectory(workDirectory, version);
  const manifestPath = join(directory, manifestFile);
  if (!existsSync(manifestPath)) {
    await mkdir(directory, { recursive: true });
    await writeFile(manifestPath, await downloadObject(client, `${version}/${manifestFile}`));
  }
  const manifest = (await Bun.file(manifestPath).json()) as Manifest;
  if (manifest.version !== version) {
    throw new GalleryRefused(`${manifestPath} names gallery version ${manifest.version}`);
  }
  for (const part of manifest.parts) {
    verifiedPartBytes(part, await localPartBytes(client, workDirectory, version, part));
  }
  await recognizer.install(directory, galleryDirectory);
  console.log(`Installed gallery version ${version} in ${galleryDirectory}.`);
}
