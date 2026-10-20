import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportClient } from '../import/import-run';
import { budgetReport } from './budget';
import { featurePrints } from './feature-prints';
import {
  type GalleryRow,
  type Part,
  addOnLimit,
  galleryParts,
  installedRows,
  modelPart,
  newVersionId,
  updateBytes,
} from './format';
import { cachedImages } from './images';
import { type FeaturePrintModel, type Manifest, galleryFormatVersion, manifestFile } from './manifest';
import { type ConvertedModel, modelArchive } from './model';
import { galleryPrintings } from './printings';
import { type Recognizer, macOSMajor } from './recognizer';
import {
  GalleryRefused,
  type RecordedVersion,
  copyObject,
  publishedVersions,
  recordVersion,
  recordedVersions,
  removeVersionFolder,
  uploadObject,
} from './storage';
import { evidenceVersion, recognizerCommit } from './repository';
import { localPartBytes, versionDirectory } from './work-folder';

export type BuildOptions = {
  manifestLocation: string;
  imagesDirectory: string;
  workDirectory: string;
  newBase: boolean;
  cachedImagesBulkFile?: string;
};

type Plan =
  | { kind: 'base'; reason: string }
  | { kind: 'add-on'; addOn: number; firstRow: number; changed: GalleryRow[] }
  | { kind: 'unchanged' };

function refuseAnotherConvertedModel(recognizer: Recognizer, converted: ConvertedModel) {
  const { sha256 } = recognizer.about.model;
  if (sha256 !== converted.model.sha256) {
    throw new GalleryRefused(
      `The converted model ${converted.modelPackage} has SHA-256 ${sha256}, but ${converted.modelFile} names ${converted.model.sha256}. Build only with the model that the model file names.`,
    );
  }
}

function describedModel(model: FeaturePrintModel): string {
  return `${model.name} with SHA-256 ${model.sha256}`;
}

function refuseAnAddOnAcrossModels(published: RecordedVersion, converted: ConvertedModel) {
  const { formatVersion, model } = published.manifest;
  if (formatVersion !== galleryFormatVersion) {
    throw new GalleryRefused(
      `Gallery version ${published.version} has gallery format ${formatVersion}, not ${galleryFormatVersion}. Build a new base with --new-base.`,
    );
  }
  if (model.name !== converted.model.name || model.sha256 !== converted.model.sha256) {
    throw new GalleryRefused(
      `Gallery version ${published.version} was built with model ${describedModel(model)}, not ${describedModel(converted.model)}. An add-on cannot mix the two. Build a new base with --new-base.`,
    );
  }
}

function sameRow(a: GalleryRow, b: GalleryRow): boolean {
  return JSON.stringify(a.printing) === JSON.stringify(b.printing) && Buffer.from(a.codes).equals(Buffer.from(b.codes));
}

function plan(rows: GalleryRow[], published: RecordedVersion | null, installed: Map<string, GalleryRow> | null, recognizer: Recognizer, newBase: boolean): Plan {
  if (newBase) {
    return { kind: 'base', reason: 'the owner asked for a new base' };
  }
  if (!published || !installed) {
    return { kind: 'base', reason: 'no gallery version is published' };
  }
  const manifest = published.manifest;
  if (manifest.encoding.type !== 'int8') {
    return { kind: 'base', reason: 'the encoding changed' };
  }
  if (macOSMajor(manifest.builtWith.macOS) !== macOSMajor(recognizer.about.macOS)) {
    return { kind: 'base', reason: 'the macOS major version changed' };
  }
  const changed = rows.filter((row) => {
    const earlier = installed.get(row.printing.id);
    return !earlier || !sameRow(earlier, row);
  });
  if (changed.length === 0) {
    return { kind: 'unchanged' };
  }
  const publishedGalleryParts = manifest.parts.filter((part) => part.kind === 'gallery');
  const baseRows = publishedGalleryParts.filter((part) => part.addOn === 0).reduce((sum, part) => sum + part.rowCount, 0);
  const addOnRows = publishedGalleryParts.filter((part) => part.addOn > 0).reduce((sum, part) => sum + part.rowCount, 0);
  if (addOnRows + changed.length > baseRows * addOnLimit) {
    return {
      kind: 'base',
      reason: `add-ons would hold ${addOnRows + changed.length} rows, more than ${addOnLimit * 100}% of the ${baseRows} base rows`,
    };
  }
  return {
    kind: 'add-on',
    addOn: Math.max(...publishedGalleryParts.map((part) => part.addOn)) + 1,
    firstRow: publishedGalleryParts.reduce((sum, part) => sum + part.rowCount, 0),
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

export async function buildGallery(
  client: ImportClient,
  recognizer: Recognizer,
  model: ConvertedModel,
  options: BuildOptions,
): Promise<Manifest | null> {
  refuseAnotherConvertedModel(recognizer, model);
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
      publishedParts.set(part.name, await localPartBytes(() => client, options.workDirectory, published.version, part));
    }
  }
  if (published && !options.newBase) {
    refuseAnAddOnAcrossModels(published, model);
  }
  const installed =
    published && !options.newBase ? installedRows(published.manifest, (part) => publishedParts.get(part.name)!) : null;
  const current = new Set(rows.map((row) => row.printing.id));
  const leftOver = installed ? [...installed.keys()].filter((id) => !current.has(id)).length : 0;
  if (leftOver > 0) {
    console.log(`${leftOver} rows of gallery version ${published!.version} are no longer in the card catalog. They stay until the next base.`);
  }
  const decision = plan(rows, published, installed, recognizer, options.newBase);
  if (decision.kind === 'unchanged') {
    console.log(`Nothing changed since gallery version ${published!.version}. No new version was built.`);
    return null;
  }
  const version = newVersionId();
  let parts: Part[];
  if (decision.kind === 'base') {
    console.log(`Building a new base, because ${decision.reason}.`);
    parts = [...galleryParts(0, 0, rows, model.model.vectorSize), modelPart(await modelArchive(model.modelPackage))];
  } else {
    console.log(`Building add-on ${decision.addOn} with ${decision.changed.length} new or changed rows.`);
    parts = [
      ...published!.manifest.parts.map((part) => ({ ...part, bytes: publishedParts.get(part.name)! })),
      ...galleryParts(decision.addOn, decision.firstRow, decision.changed, model.model.vectorSize),
    ];
  }
  const distinctRows = decision.kind === 'base' ? rows.length : new Set([...installed!.keys(), ...decision.changed.map((row) => row.printing.id)]).size;
  const manifest: Manifest = {
    formatVersion: galleryFormatVersion,
    version,
    builtAt: new Date().toISOString(),
    model: model.model,
    thresholds: model.thresholds,
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


  const evidence = await evidenceVersion();
  const kept = [manifest, ...[published, versions.find((recorded) => recorded.version === evidence)]
    .filter((recorded): recorded is RecordedVersion => !!recorded)
    .filter((recorded, index, all) => all.findIndex((other) => other.version === recorded.version) === index)
    .map((recorded) => recorded.manifest)];
  console.log(`Uploaded gallery version ${version}. It is not published.`);
  for (const line of budgetReport(manifest, kept, published ? updateBytes(manifest, published.manifest) : null)) {
    console.log(line);
  }
  console.log(`Timings: ${timings.join(', ')}.`);
  return manifest;
}
