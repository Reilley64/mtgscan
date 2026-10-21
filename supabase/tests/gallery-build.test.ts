import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { $ } from 'bun';

import {
  basicLands,
  catalogFixture,
  resetCardCatalog,
  runCatalogImport,
  runGalleryCommand,
  runGalleryCommandWith,
  type ScryfallRecord,
  withoutCards,
} from './catalog-import-command';
import { cleanGallery } from './gallery-versions';
import { asDatabaseOwner, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(120_000);

type ManifestPart = {
  name: string;
  kind: 'gallery' | 'printing_list' | 'model';
  addOn: number;
  firstRow: number;
  rowCount: number;
  compressedBytes: number;
  rawBytes: number;
  sha256: string;
};

type Manifest = {
  formatVersion: number;
  version: string;
  rows: number;
  model: { name: string; sha256: string };
  parts: ManifestPart[];
};

type ConvertedModel = { modelFile: string; models: string; sha256: string };

type PrintingListRow = { id: string; name: string; faceNames: string[]; finishes: string[]; basicLand: boolean };

const importKeyClient = secretKeyClient();
const bucket = importKeyClient.storage.from('gallery');
const lightningBolt = 'Lightning Bolt';
const blackLotus = 'Black Lotus';
const firstBuildRows = 388;
const unreachableLocalStack = 'http://127.0.0.1:9';
const modelName = 'pe-core-s16-384';
const thresholds = { notACard: 0.689, orientationMargin: 0.03, artMargin: 0.025 };

let alice: TestUser;
let images: ReturnType<typeof Bun.serve>;
let imagesDirectory: string;
let workDirectory: string;
let model: ConvertedModel;
const releaseDates = new Map<string, string>();

function withLocalImages(records: ScryfallRecord[], imageVersion: (record: ScryfallRecord) => number = () => 1): ScryfallRecord[] {
  return records.map((record) => {
    releaseDates.set(record.id as string, record.released_at as string);
    const image = `http://127.0.0.1:${images.port}/${record.id}.jpg?${imageVersion(record)}`;
    const faces = record.card_faces as { oracle_id?: string; image_uris?: object }[] | undefined;
    return record.image_uris || !faces
      ? { ...record, image_uris: { ...(record.image_uris as object), normal: image } }
      : { ...record, card_faces: faces.map((face) => ({ ...face, image_uris: { ...face.image_uris, normal: image } })) };
  });
}

async function galleryFixture(imageVersion?: (record: ScryfallRecord) => number): Promise<string> {
  return catalogFixture({
    defaultCards: (records) => withLocalImages(records, imageVersion),
  });
}

async function packageSha256(directory: string): Promise<string> {
  return (await $`find . -type f | sed 's|^./||' | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256`.cwd(directory).text()).split(' ')[0]!;
}

async function convertedModel(sha256?: string): Promise<ConvertedModel> {
  const models = await mkdtemp(join(tmpdir(), 'mtgscan-gallery-models-'));
  const modelPackage = join(models, `${modelName}.mlpackage`);
  const files: [string, Uint8Array | string][] = [
    ['Manifest.json', '{"fileFormatVersion": "1.0.0"}'],
    ['Data/com.apple.CoreML/model.mlmodel', 'program'],
    ['Data/com.apple.CoreML/weights/weight.bin', randomBytes(2_000_000)],
  ];
  for (const [file, bytes] of files) {
    await mkdir(dirname(join(modelPackage, file)), { recursive: true });
    await writeFile(join(modelPackage, file), bytes);
  }
  const actual = await packageSha256(modelPackage);
  const modelFile = join(models, 'model.json');
  await writeFile(modelFile, JSON.stringify({ name: modelName, sha256: sha256 ?? actual, inputSize: 384, vectorSize: 512, thresholds }));
  return { modelFile, models, sha256: actual };
}

async function withThresholds(converted: ConvertedModel, changed: typeof thresholds): Promise<ConvertedModel> {
  const modelFile = join(await mkdtemp(join(tmpdir(), 'mtgscan-gallery-model-file-')), 'model.json');
  await writeFile(modelFile, JSON.stringify({ name: modelName, sha256: converted.sha256, inputSize: 384, vectorSize: 512, thresholds: changed }));
  return { ...converted, modelFile };
}

async function buildWithModel(converted: ConvertedModel, manifest: string, ...flags: string[]) {
  return runGalleryCommand(
    'build', '--manifest', manifest, '--images', imagesDirectory, '--work', workDirectory,
    '--model-file', converted.modelFile, '--models', converted.models, ...flags,
  );
}

async function build(manifest: string, ...flags: string[]) {
  return buildWithModel(model, manifest, ...flags);
}

async function modelArchive(manifest: Manifest): Promise<string> {
  const part = manifest.parts.find((candidate) => candidate.kind === 'model')!;
  const archive = join(await mkdtemp(join(tmpdir(), 'mtgscan-model-part-')), 'model.tar');
  await writeFile(archive, inflateSync(await download(`${manifest.version}/${part.name}`)));
  return archive;
}

function builtVersion(output: string): string {
  const version = /Uploaded gallery version (\d{8}-[0-9a-f]{6})/.exec(output)?.[1];
  if (!version) {
    throw new Error(`No gallery version in the output:\n${output}`);
  }
  return version;
}

async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket.download(path);
  expect(error).toBeNull();
  return new Uint8Array(await data!.arrayBuffer());
}

async function manifestOf(version: string): Promise<Manifest> {
  return JSON.parse(new TextDecoder().decode(await download(`${version}/manifest.json`)));
}

async function printingList(manifest: Manifest, addOn: number): Promise<PrintingListRow[]> {
  const rows: PrintingListRow[] = [];
  for (const part of manifest.parts.filter((part) => part.kind === 'printing_list' && part.addOn === addOn)) {
    rows.push(...JSON.parse(inflateSync(await download(`${manifest.version}/${part.name}`)).toString('utf8')));
  }
  return rows;
}

async function recordedVersions() {
  const { data, error } = await importKeyClient.from('gallery_versions').select('version, published_at').order('uploaded_at');
  expect(error).toBeNull();
  return data!;
}

async function storedFolders() {
  const { data } = await bucket.list('', { limit: 1000 });
  return data!.map((entry) => entry.name).filter((name) => name !== 'published.json').sort();
}

async function publishWithParity(version: string) {
  expect((await runGalleryCommand('parity', version, '--lowest-cosine', '0.99976', '--mean-cosine', '1.00003', '--references', '24')).exitCode).toBe(0);
  const published = await runGalleryCommand('publish', version);
  expect(published.exitCode).toBe(0);
  return published;
}

beforeAll(async () => {
  alice = await signUpNewUser();
  images = Bun.serve({ port: 0, fetch: (request) => new Response(`image ${new URL(request.url).pathname}${new URL(request.url).search}`) });
  imagesDirectory = await mkdtemp(join(tmpdir(), 'mtgscan-gallery-images-'));
  workDirectory = await mkdtemp(join(tmpdir(), 'mtgscan-gallery-work-'));
  model = await convertedModel();
  await cleanGallery();
  await resetCardCatalog();
  const catalog = await catalogFixture(withoutCards([lightningBolt]));
  expect((await runCatalogImport(catalog)).exitCode).toBe(0);
});

afterAll(async () => {
  images.stop();
  await cleanGallery();
});

describe('a converted model that the model file does not name', () => {
  test('a build is refused when the SHA-256 of the converted model does not match the model file', async () => {
    const named = await convertedModel('a'.repeat(64));

    const refused = await buildWithModel(named, await galleryFixture());

    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain(
      `The converted model ${join(named.models, `${modelName}.mlpackage`)} has SHA-256 ${named.sha256}, but ${named.modelFile} names ${'a'.repeat(64)}.`,
    );
    expect(await recordedVersions()).toEqual([]);
  });
});

describe('the first gallery build', () => {
  let version: string;
  let output: string;
  let manifest: Manifest;

  beforeAll(async () => {
    const result = await build(await galleryFixture());
    output = result.output;
    expect(result.exitCode).toBe(0);
    version = builtVersion(output);
    manifest = await manifestOf(version);
  });

  test('uploads a base that is not published, with a SHA-256 for each part', async () => {
    expect(manifest.rows).toBe(firstBuildRows);
    expect(manifest.parts.map((part) => [part.kind, part.addOn])).toEqual([
      ['gallery', 0],
      ['printing_list', 0],
      ['model', 0],
    ]);
    for (const part of manifest.parts) {
      const bytes = await download(`${version}/${part.name}`);
      expect(bytes.length).toBe(part.compressedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(part.sha256);
      expect(inflateSync(bytes).length).toBe(part.rawBytes);
      expect(part.compressedBytes).toBeLessThan(50_000_000);
    }
    expect(inflateSync(await download(`${version}/${manifest.parts[0]!.name}`)).length).toBe(firstBuildRows * 512);
    expect(await recordedVersions()).toEqual([{ version, published_at: null }]);
  });

  test('the manifest has gallery format 2 and takes the model and the thresholds from the model file', () => {
    expect(manifest).toMatchObject({
      formatVersion: 2,
      model: { name: modelName, sha256: model.sha256, inputSize: { width: 384, height: 384 }, vectorSize: 512 },
      thresholds,
    });
    expect(manifest).not.toHaveProperty('featurePrint');
  });

  test('the model part of the base is a tar archive of the converted model, sorted by path', async () => {
    const archive = await modelArchive(manifest);
    const unpacked = await mkdtemp(join(tmpdir(), 'mtgscan-model-unpacked-'));
    await $`tar -xf ${archive} -C ${unpacked}`;

    expect(manifest.parts.find((part) => part.kind === 'model')).toMatchObject({ name: 'base-model.zlib', addOn: 0, firstRow: 0, rowCount: 0 });
    expect((await $`tar -tf ${archive}`.text()).trim().split('\n')).toEqual([
      'model.mlpackage/',
      'model.mlpackage/Data/',
      'model.mlpackage/Data/com.apple.CoreML/',
      'model.mlpackage/Data/com.apple.CoreML/model.mlmodel',
      'model.mlpackage/Data/com.apple.CoreML/weights/',
      'model.mlpackage/Data/com.apple.CoreML/weights/weight.bin',
      'model.mlpackage/Manifest.json',
    ]);
    expect(await packageSha256(join(unpacked, 'model.mlpackage'))).toBe(model.sha256);
  });

  test('installs from the work folder for the scanner evidence replay, without Storage', async () => {
    const galleryDirectory = await mkdtemp(join(tmpdir(), 'mtgscan-replay-gallery-'));

    const installed = await runGalleryCommandWith(
      { SUPABASE_URL: unreachableLocalStack },
      'install', version, '--work', workDirectory, '--gallery', galleryDirectory,
    );

    expect(installed.exitCode).toBe(0);
    expect(installed.output).toContain(`Installed gallery version ${version} in ${galleryDirectory}.`);
    expect(await Bun.file(join(galleryDirectory, 'manifest.json')).json()).toMatchObject({ version, rows: firstBuildRows });
  });

  test('a signed-in user cannot read the version before it is published', async () => {
    const { data } = await alice.client.storage.from('gallery').download(`${version}/manifest.json`);

    expect(data).toBeNull();
  });

  test('signed URLs let a development build download a version that is not published', async () => {
    const signed = await runGalleryCommand('sign', version, '--hours', '1');
    const links = JSON.parse(signed.output) as { manifest: string; parts: Record<string, string> };
    const manifest = (await (await fetch(links.manifest)).json()) as Manifest;

    expect(signed.exitCode).toBe(0);
    expect(manifest.version).toBe(version);
    expect(Object.keys(links.parts).sort()).toEqual(manifest.parts.map((part) => part.name).sort());
  });

  test('the printing list keeps only card printings in the card catalog, without front cards, in release order', async () => {
    const rows = await printingList(manifest, 0);
    const dates = rows.map((row) => releaseDates.get(row.id)!);

    expect(rows.filter((row) => row.name === lightningBolt)).toEqual([]);
    expect(rows.filter((row) => row.name === 'Surprise!')).toEqual([]);
    expect(dates).toEqual([...dates].sort());
    expect(output).toContain('3 paper printings are not in the card catalog');
  });

  test('the printing list flags basic lands and carries face names and finishes', async () => {
    const rows = await printingList(manifest, 0);

    expect(rows.filter((row) => row.basicLand).map((row) => row.id).sort()).toEqual(basicLands.map((land) => land.id).sort());
    expect(rows.find((row) => row.name === 'Fire // Ice')).toMatchObject({ faceNames: ['Fire', 'Ice'] });
    expect(rows.find((row) => row.name === blackLotus)?.finishes.length).toBeGreaterThan(0);
  });

  test('reports the sizes against the Free plan budget, with the model part in the full install and in Storage', () => {
    const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
    const modelBytes = manifest.parts.find((part) => part.kind === 'model')!.compressedBytes;
    const allBytes = manifest.parts.reduce((sum, part) => sum + part.compressedBytes, 0);

    expect(output).toContain(`Gallery version ${version}: ${firstBuildRows} rows, ${megabytes(allBytes)} in 3 parts`);
    expect(output).toContain(`model ${megabytes(modelBytes)})`);
    expect(output).toContain(`A full install downloads ${megabytes(allBytes)}.`);
    expect(output).toContain(`Storage for the kept versions (${version}) is ${megabytes(allBytes)}`);
    expect(output).toContain('of the 50.0 MB upload limit');
    expect(output).toContain('5 GB of egress a month covers');
    expect(output).toContain('of 1 GB');
  });
});

describe('publishing', () => {
  let first: string;

  beforeAll(async () => {
    first = (await recordedVersions())[0]!.version;
  });

  test('is refused without a recorded parity pass, and the pointer does not move', async () => {
    const refused = await runGalleryCommand('publish', first);

    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain('has no recorded parity check');
    expect((await bucket.download('published.json')).data).toBeNull();
  });

  test('a failed parity check is recorded, and publishing is still refused', async () => {
    const parity = await runGalleryCommand('parity', first, '--lowest-cosine', '0.97', '--mean-cosine', '0.99', '--references', '24');
    const refused = await runGalleryCommand('publish', first);

    expect(parity.output).toContain('It does not pass');
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain('did not pass');
  });

  test('after a parity pass, the pointer names the version and signed-in users can read it', async () => {
    await publishWithParity(first);
    const pointer = await alice.client.storage.from('gallery').download('published.json');
    const manifest = await alice.client.storage.from('gallery').download(`${first}/manifest.json`);

    expect(JSON.parse(await pointer.data!.text())).toMatchObject({ formatVersion: 2, version: first, manifest: `${first}/manifest.json` });
    expect(manifest.error).toBeNull();
  });

  test('a build with nothing changed uploads no version', async () => {
    const result = await build(await galleryFixture());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(`Nothing changed since gallery version ${first}`);
    expect(await recordedVersions()).toHaveLength(1);
  });

  test('a build with new recognizer thresholds in the model file uploads a new base with the same model part, even with no changed rows', async () => {
    const changed = { ...thresholds, notACard: 0.7 };
    const published = await manifestOf(first);

    const result = await buildWithModel(await withThresholds(model, changed), await galleryFixture());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Building a new base, because the recognizer thresholds changed.');
    const newBase = await manifestOf(builtVersion(result.output));
    expect(newBase).toMatchObject({ thresholds: changed, rows: firstBuildRows });
    expect(newBase.parts.every((part) => part.addOn === 0)).toBe(true);
    expect(newBase.parts.find((part) => part.kind === 'model')).toEqual(published.parts.find((part) => part.kind === 'model'));
  });
});

describe('the next gallery builds', () => {
  let first: Manifest;
  let addOn: Manifest;
  let newBase: Manifest;
  let addOnOutput: string;

  beforeAll(async () => {
    first = await manifestOf((await recordedVersions())[0]!.version);
    const catalog = await catalogFixture({
      updatedAt: '2026-10-15T21:00:00.000+00:00',
    });
    expect((await runCatalogImport(catalog)).exitCode).toBe(0);
    const addOnBuild = await build(await galleryFixture((record) => (record.name === blackLotus && record.set === 'lea' ? 2 : 1)));
    expect(addOnBuild.exitCode).toBe(0);
    addOnOutput = addOnBuild.output;
    addOn = await manifestOf(builtVersion(addOnBuild.output));
    let changed = 0;
    const newBaseBuild = await build(await galleryFixture((record) => (changed++ < 40 ? 3 : 1)));
    expect(newBaseBuild.exitCode).toBe(0);
    newBase = await manifestOf(builtVersion(newBaseBuild.output));
  });

  test('new card printings and a changed image go into an add-on, and the base parts stay the same', async () => {
    const addOnRows = await printingList(addOn, 1);

    expect(addOn.parts.filter((part) => part.addOn === 0)).toEqual(first.parts);
    expect(addOnRows.map((row) => row.name).sort()).toEqual([blackLotus, lightningBolt, lightningBolt, lightningBolt]);
    expect(addOn.rows).toBe(firstBuildRows + 3);
  });

  test('a phone with the published version downloads only the add-on', () => {
    const addOnBytes = addOn.parts.filter((part) => part.addOn === 1).reduce((sum, part) => sum + part.compressedBytes, 0);

    expect(addOnOutput).toContain(`downloads ${(addOnBytes / 1_000_000).toFixed(1)} MB to update`);
  });

  test('when add-ons pass 10% of the base, the build cuts a new base', () => {
    expect(newBase.parts.every((part) => part.addOn === 0)).toBe(true);
    expect(newBase.rows).toBe(firstBuildRows + 3);
  });

  test('publishing keeps the published and the previous version, and deletes the rest', async () => {
    await publishWithParity(newBase.version);

    expect((await recordedVersions()).map((row) => row.version).sort()).toEqual([first.version, newBase.version].sort());
    expect(await storedFolders()).toEqual([first.version, newBase.version].sort());
  });
});

describe('a new model', () => {
  let newModel: ConvertedModel;
  let published: Manifest;

  beforeAll(async () => {
    newModel = await convertedModel();
    const pointer = JSON.parse(new TextDecoder().decode(await download('published.json'))) as { version: string };
    published = await manifestOf(pointer.version);
  });

  test('a build with another model than the published gallery version is refused without --new-base', async () => {
    const before = await recordedVersions();

    const refused = await buildWithModel(newModel, await galleryFixture((record) => (record.name === blackLotus ? 4 : 1)));

    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain(
      `Gallery version ${published.version} was built with model ${modelName} with SHA-256 ${model.sha256}, not ${modelName} with SHA-256 ${newModel.sha256}.`,
    );
    expect(refused.output).toContain('--new-base');
    expect(await recordedVersions()).toEqual(before);
  });

  test('with --new-base, a build with another model uploads a new base with the new model part', async () => {
    const result = await buildWithModel(newModel, await galleryFixture(), '--new-base');
    const newBase = await manifestOf(builtVersion(result.output));
    const unpacked = await mkdtemp(join(tmpdir(), 'mtgscan-model-unpacked-'));
    await $`tar -xf ${await modelArchive(newBase)} -C ${unpacked}`;

    expect(result.exitCode).toBe(0);
    expect(newBase.model).toMatchObject({ name: modelName, sha256: newModel.sha256 });
    expect(newBase.parts.every((part) => part.addOn === 0)).toBe(true);
    expect(await packageSha256(join(unpacked, 'model.mlpackage'))).toBe(newModel.sha256);
  });

  test('a new base with the same model has the same model part, whatever the times of its files', async () => {
    const modelPackage = join(model.models, `${modelName}.mlpackage`);
    for (const path of (await $`find ${modelPackage}`.text()).trim().split('\n')) {
      await utimes(path, new Date('2027-01-02T03:04:05Z'), new Date('2027-01-02T03:04:05Z'));
    }

    const result = await build(await galleryFixture(), '--new-base');
    const newBase = await manifestOf(builtVersion(result.output));

    expect(result.exitCode).toBe(0);
    expect(newBase.parts.find((part) => part.kind === 'model')).toEqual(published.parts.find((part) => part.kind === 'model'));
  });
});

describe('a published gallery version of format 1', () => {
  let published: string;

  beforeAll(async () => {
    published = JSON.parse(new TextDecoder().decode(await download('published.json'))).version;
    await asDatabaseOwner(
      (database) => database`
        update public.gallery_versions
        set manifest = manifest - 'model' - 'thresholds' || ${{
          formatVersion: 1,
          featurePrint: { request: 'VNGenerateImageFeaturePrintRequest', revision: 2, dimension: 768 },
        }}::jsonb
        where version = ${published}`,
    );
  });

  test('a build is refused without --new-base', async () => {
    const before = await recordedVersions();

    const refused = await build(await galleryFixture((record) => (record.name === blackLotus ? 5 : 1)));

    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain(`Gallery version ${published} has gallery format 1, not 2. Build a new base with --new-base.`);
    expect(await recordedVersions()).toEqual(before);
  });

  test('with --new-base, a build uploads a new base of format 2', async () => {
    const result = await build(await galleryFixture(), '--new-base');

    expect(result.exitCode).toBe(0);
    const newBase = await manifestOf(builtVersion(result.output));
    expect(newBase.formatVersion).toBe(2);
    expect(newBase.parts.every((part) => part.addOn === 0)).toBe(true);
  });
});

describe('the hosted project', () => {
  test('without --hosted, a gallery build refuses a Supabase URL that is not the local stack', async () => {
    const before = await recordedVersions();

    const refused = await runGalleryCommandWith(
      { SUPABASE_URL: 'https://not-a-project.supabase.co' },
      'build', '--manifest', await galleryFixture(), '--images', imagesDirectory, '--work', workDirectory,
    );

    expect(refused.exitCode).toBe(2);
    expect(refused.output).toContain('Add --hosted for the hosted project.');
    expect(await recordedVersions()).toEqual(before);
  });

  test('without --hosted, a project ref does not move a gallery command to the hosted project', async () => {
    const status = await runGalleryCommandWith({ SUPABASE_URL: '', SUPABASE_PROJECT_REF: 'not-a-project' }, 'status');

    expect(status.exitCode).toBe(0);
    expect(status.output).toContain('Storage for all recorded versions');
  });

  test('with --hosted, a gallery build refuses the local stack', async () => {
    const refused = await runGalleryCommand('build', '--hosted', '--manifest', await galleryFixture(), '--images', imagesDirectory, '--work', workDirectory);

    expect(refused.exitCode).toBe(2);
    expect(refused.output).toContain('With --hosted, the local stack');
  });
});
