import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import {
  basicLands,
  catalogFixture,
  resetCardCatalog,
  runCatalogImport,
  runGalleryCommand,
  type ScryfallRecord,
  withoutCards,
} from './catalog-import-command';
import { cleanGallery } from './gallery-versions';
import { secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(120_000);

type ManifestPart = {
  name: string;
  kind: 'gallery' | 'printing_list';
  addOn: number;
  firstRow: number;
  rowCount: number;
  compressedBytes: number;
  rawBytes: number;
  sha256: string;
};

type Manifest = { version: string; rows: number; parts: ManifestPart[] };

type PrintingListRow = { id: string; name: string; faceNames: string[]; finishes: string[]; basicLand: boolean };

const importKeyClient = secretKeyClient();
const bucket = importKeyClient.storage.from('gallery');
const lightningBolt = 'Lightning Bolt';
const blackLotus = 'Black Lotus';
const firstBuildRows = 376;

let alice: TestUser;
let images: ReturnType<typeof Bun.serve>;
let imagesDirectory: string;
let workDirectory: string;
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

async function build(manifest: string, ...flags: string[]) {
  return runGalleryCommand('build', '--manifest', manifest, '--images', imagesDirectory, '--work', workDirectory, ...flags);
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
  await cleanGallery();
  await resetCardCatalog();
  const catalog = await catalogFixture(withoutCards([lightningBolt]));
  expect((await runCatalogImport(catalog)).exitCode).toBe(0);
});

afterAll(async () => {
  images.stop();
  await cleanGallery();
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
    ]);
    for (const part of manifest.parts) {
      const bytes = await download(`${version}/${part.name}`);
      expect(bytes.length).toBe(part.compressedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(part.sha256);
      expect(inflateSync(bytes).length).toBe(part.rawBytes);
      expect(part.compressedBytes).toBeLessThan(50_000_000);
    }
    expect(inflateSync(await download(`${version}/${manifest.parts[0]!.name}`)).length).toBe(firstBuildRows * 768);
    expect(await recordedVersions()).toEqual([{ version, published_at: null }]);
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

  test('reports the sizes against the Free plan budget', () => {
    expect(output).toContain(`Gallery version ${version}: ${firstBuildRows} rows`);
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

    expect(JSON.parse(await pointer.data!.text())).toMatchObject({ version: first, manifest: `${first}/manifest.json` });
    expect(manifest.error).toBeNull();
  });

  test('a build with nothing changed uploads no version', async () => {
    const result = await build(await galleryFixture());

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(`Nothing changed since gallery version ${first}`);
    expect(await recordedVersions()).toHaveLength(1);
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
