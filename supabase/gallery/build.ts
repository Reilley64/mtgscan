import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportClient } from '../import/import-run';
import { budgetReport } from './budget';
import { featurePrints } from './feature-prints';
import {
  type GalleryRow,
  type Manifest,
  type ManifestPart,
  type Part,
  addOnLimit,
  featurePrintDimension,
  installedRows,
  layerParts,
  manifestFormatVersion,
  newVersionId,
} from './format';
import { cachedImages } from './images';
import { galleryPrintings } from './printings';
import type { Recognizer } from './recognizer';
import {
  type RecordedVersion,
  copyObject,
  downloadObject,
  manifestFile,
  publishedVersions,
  recordVersion,
  recordedVersions,
  removeVersionFolder,
  uploadObject,
} from './storage';
import { evidenceVersion, recognizerCommit } from './repository';

export type BuildOptions = {
  manifestLocation: string;
  imagesDirectory: string;
  workDirectory: string;
  newBase: boolean;
  cachedImagesBulkFile?: string;
};

type Plan =
  | { kind: 'base'; reason: string }
  | { kind: 'add-on'; layer: number; firstRow: number; changed: GalleryRow[] }
  | { kind: 'unchanged' };

export function versionDirectory(workDirectory: string, version: string): string {
  return join(workDirectory, 'versions', version);
}

export async function localPartBytes(
  client: ImportClient,
  workDirectory: string,
  version: string,
  part: ManifestPart,
): Promise<Uint8Array> {
  const directory = versionDirectory(workDirectory, version);
  const file = join(directory, part.name);
  if (existsSync(file)) {
    return new Uint8Array(await Bun.file(file).arrayBuffer());
  }
  console.error(`Downloading ${version}/${part.name} from Storage.`);
  const bytes = await downloadObject(client, `${version}/${part.name}`);
  await mkdir(directory, { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

function sameRow(a: GalleryRow, b: GalleryRow): boolean {
  return JSON.stringify(a.printing) === JSON.stringify(b.printing) && Buffer.from(a.codes).equals(Buffer.from(b.codes));
}

function majorVersion(macOS: string): string {
  return macOS.split('.')[0]!;
}

function plan(rows: GalleryRow[], published: RecordedVersion | null, installed: Map<string, GalleryRow> | null, recognizer: Recognizer, newBase: boolean): Plan {
  if (!published || !installed) {
    return { kind: 'base', reason: 'no gallery version is published' };
  }
  const manifest = published.manifest;
  if (newBase) {
    return { kind: 'base', reason: 'the owner asked for a new base' };
  }
  if (manifest.featurePrint.revision !== recognizer.about.featurePrintRevision) {
    return { kind: 'base', reason: 'the feature print revision changed' };
  }
  if (manifest.encoding.type !== 'int8') {
    return { kind: 'base', reason: 'the encoding changed' };
  }
  if (majorVersion(manifest.builtWith.macOS) !== majorVersion(recognizer.about.macOS)) {
    return { kind: 'base', reason: 'the macOS major version changed' };
  }
  const changed = rows.filter((row) => {
    const earlier = installed.get(row.printing.id);
    return !earlier || !sameRow(earlier, row);
  });
  if (changed.length === 0) {
    return { kind: 'unchanged' };
  }
  const galleryParts = manifest.parts.filter((part) => part.kind === 'gallery');
  const baseRows = galleryParts.filter((part) => part.layer === 0).reduce((sum, part) => sum + part.rowCount, 0);
  const addOnRows = galleryParts.filter((part) => part.layer > 0).reduce((sum, part) => sum + part.rowCount, 0);
  if (addOnRows + changed.length > baseRows * addOnLimit) {
    return { kind: 'base', reason: `add-ons would hold ${addOnRows + changed.length} rows, more than 10% of the ${baseRows} base rows` };
  }
  return {
    kind: 'add-on',
    layer: Math.max(...galleryParts.map((part) => part.layer)) + 1,
    firstRow: galleryParts.reduce((sum, part) => sum + part.rowCount, 0),
    changed,
  };
}

async function upload(client: ImportClient, manifest: Manifest, parts: Part[], published: RecordedVersion | null) {
  const reusable = new Map(published?.manifest.parts.map((part) => [part.name, part.sha256]) ?? []);
  try {
    for (const part of parts) {
      if (published && reusable.get(part.name) === part.sha256) {
        await copyObject(client, `${published.version}/${part.name}`, `${manifest.version}/${part.name}`);
      } else {
        await uploadObject(client, `${manifest.version}/${part.name}`, part.bytes, 'application/octet-stream');
      }
    }
    await uploadObject(client, `${manifest.version}/${manifestFile}`, new TextEncoder().encode(JSON.stringify(manifest, null, 1)), 'application/json');
    await recordVersion(client, manifest);
  } catch (error) {
    await removeVersionFolder(client, manifest.version).catch(() => undefined);
    throw error;
  }
}

function seconds(startedAt: number): string {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)} s`;
}

export async function buildGallery(client: ImportClient, recognizer: Recognizer, options: BuildOptions): Promise<Manifest | null> {
  const timings: string[] = [];
  let startedAt = performance.now();
  const source = await galleryPrintings(client, options.manifestLocation);
  timings.push(`printings ${seconds(startedAt)}`);
  console.log(`${source.printings.length} card printings from Scryfall default_cards of ${source.scryfallSnapshot}.`);
  if (source.notInCardCatalog.length > 0) {
    console.log(
      `${source.notInCardCatalog.length} paper printings are not in the card catalog and are left out, such as ${source.notInCardCatalog.slice(0, 5).join(', ')}.`,
    );
  }

  startedAt = performance.now();
  const { cache, report } = await cachedImages(options.imagesDirectory, source.printings, options.cachedImagesBulkFile);
  timings.push(`images ${seconds(startedAt)}`);
  console.log(`Images: ${report.cached} cached, ${report.downloaded} downloaded, ${report.replaced} replaced.`);
  if (report.failed.length > 0) {
    throw new Error(`${report.failed.length} images did not download, such as ${report.failed.slice(0, 3).join(', ')}`);
  }

  startedAt = performance.now();
  await mkdir(options.workDirectory, { recursive: true });
  const prints = await featurePrints(options.workDirectory, source.printings, cache, recognizer);
  timings.push(`feature prints ${seconds(startedAt)}`);
  console.log(`Feature prints: ${prints.computed} computed, ${prints.reused} reused.`);
  const rows: GalleryRow[] = source.printings.map((printing) => ({
    printing: printing.printing,
    codes: prints.codes.get(printing.printing.id)!,
  }));

  startedAt = performance.now();
  const versions = await recordedVersions(client);
  const published = publishedVersions(versions)[0] ?? null;
  const publishedParts = new Map<string, Uint8Array>();
  if (published) {
    for (const part of published.manifest.parts) {
      publishedParts.set(part.name, await localPartBytes(client, options.workDirectory, published.version, part));
    }
  }
  const installed = published ? installedRows(published.manifest, (part) => publishedParts.get(part.name)!) : null;
  const decision = plan(rows, published, installed, recognizer, options.newBase);
  if (decision.kind === 'unchanged') {
    console.log(`Nothing changed since gallery version ${published!.version}. No new version was built.`);
    return null;
  }
  const version = newVersionId();
  let parts: Part[];
  if (decision.kind === 'base') {
    console.log(`Building a new base, because ${decision.reason}.`);
    parts = layerParts(0, 0, rows);
  } else {
    console.log(`Building add-on ${decision.layer} with ${decision.changed.length} new or changed rows.`);
    parts = [
      ...published!.manifest.parts.map((part) => ({ ...part, bytes: publishedParts.get(part.name)! })),
      ...layerParts(decision.layer, decision.firstRow, decision.changed),
    ];
  }
  const distinctRows = decision.kind === 'base' ? rows.length : new Set([...installed!.keys(), ...decision.changed.map((row) => row.printing.id)]).size;
  const manifest: Manifest = {
    formatVersion: manifestFormatVersion,
    version,
    builtAt: new Date().toISOString(),
    featurePrint: {
      request: 'VNGenerateImageFeaturePrintRequest',
      revision: recognizer.about.featurePrintRevision,
      dimension: featurePrintDimension,
    },
    encoding: { type: 'int8', scale: 'per_vector' },
    rows: distinctRows,
    scryfallSnapshot: source.scryfallSnapshot,
    cardCatalogSnapshot: source.cardCatalogSnapshot,
    builtWith: { macOS: recognizer.about.macOS, recognizerCommit: await recognizerCommit(), machine: recognizer.about.machine },
    parts: parts.map(({ bytes: _bytes, ...part }) => part),
  };
  const directory = versionDirectory(options.workDirectory, version);
  await mkdir(directory, { recursive: true });
  for (const part of parts) {
    await writeFile(join(directory, part.name), part.bytes);
  }
  await writeFile(join(directory, manifestFile), JSON.stringify(manifest, null, 1));
  timings.push(`parts ${seconds(startedAt)}`);

  startedAt = performance.now();
  await upload(client, manifest, parts, published);
  timings.push(`upload ${seconds(startedAt)}`);

  const updateBytes = published
    ? manifest.parts
        .filter((part) => !published.manifest.parts.some((earlier) => earlier.sha256 === part.sha256))
        .reduce((sum, part) => sum + part.compressedBytes, 0)
    : null;
  const evidence = await evidenceVersion();
  const kept = [manifest, ...[published, versions.find((recorded) => recorded.version === evidence)]
    .filter((recorded): recorded is RecordedVersion => !!recorded)
    .filter((recorded, index, all) => all.findIndex((other) => other.version === recorded.version) === index)
    .map((recorded) => recorded.manifest)];
  console.log(`Uploaded gallery version ${version}. It is not published.`);
  for (const line of budgetReport(manifest, kept, updateBytes)) {
    console.log(line);
  }
  console.log(`Timings: ${timings.join(', ')}.`);
  console.log(`Next: run the parity check on the iPhone, record it with \`bun run gallery parity ${version} --lowest-cosine <n> --mean-cosine <n> --references <n>\`, then \`bun run gallery publish ${version}\`.`);
  return manifest;
}
