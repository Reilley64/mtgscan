import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { freePlan } from '../gallery/budget';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runCropsCommand } from './catalog-import-command';
import { asDatabaseOwner, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';
import type { TrainingCrop } from '../training-crops';
import { angelicCurator, delverInnistrad, evidenceRecord, jpeg, webp } from './training-crop-seeds';

setDefaultTimeout(60_000);

const secretKey = secretKeyClient();
const bucket = secretKey.storage.from('training-crops');
const imageBytes = 200_000;
const galleryPart = 'training-crop-pull/part.zlib';
const storageLimit = 2_000_000_000;

let alice: TestUser;
let aliceCopyId: string;

async function removeTrainingCrops() {
  await asDatabaseOwner((database) => database`delete from public.training_crops`);
  const { data } = await bucket.list('', { limit: 1000 });
  const names = (data ?? []).map((entry) => entry.name);
  if (names.length > 0) {
    expect((await bucket.remove(names)).error).toBeNull();
  }
}

async function stored(crop: TrainingCrop, { withImage = true } = {}): Promise<Uint8Array<ArrayBuffer>> {
  const added = await secretKey.rpc('add_training_crop', {
    request: { user_id: alice.userId, copy_id: aliceCopyId, crop },
  });
  expect(added.error).toBeNull();
  const image = new Uint8Array(await webp(imageBytes).arrayBuffer());
  image.set(new TextEncoder().encode(crop.crop_id), 12);
  if (withImage) {
    const uploaded = await bucket.upload(`${crop.crop_id}.webp`, image, { contentType: 'image/webp' });
    expect(uploaded.error).toBeNull();
  }
  return image;
}

async function storedAsJpegBeforeTheSwitchToWebp(crop: TrainingCrop): Promise<Uint8Array<ArrayBuffer>> {
  const added = await secretKey.rpc('add_training_crop', {
    request: { user_id: alice.userId, copy_id: aliceCopyId, crop },
  });
  expect(added.error).toBeNull();
  const image = new Uint8Array(await jpeg(imageBytes).arrayBuffer());
  image.set(new TextEncoder().encode(crop.crop_id), 4);
  await setAllowedImageType('image/jpeg');
  const uploaded = await bucket.upload(`${crop.crop_id}.jpg`, image, { contentType: 'image/jpeg' });
  await setAllowedImageType('image/webp');
  expect(uploaded.error).toBeNull();
  return image;
}

function setAllowedImageType(type: string) {
  return asDatabaseOwner(
    (database) => database`update storage.buckets set allowed_mime_types = array[${type}] where id = 'training-crops'`,
  );
}

async function storageBytes(): Promise<number> {
  const [row] = await asDatabaseOwner(
    (database) => database`select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as bytes from storage.objects`,
  );
  return Number(row.bytes);
}

function byCropId(crops: TrainingCrop[]): TrainingCrop[] {
  return crops.toSorted((a, b) => a.crop_id.localeCompare(b.crop_id));
}

async function readJson(folder: string, file: string) {
  return JSON.parse(await readFile(join(folder, file), 'utf8'));
}

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  alice = await signUpNewUser();
  const scanned = stack(angelicCurator);
  await committed(alice, scanBatch([scanned]));
  aliceCopyId = scanned.copy_ids[0]!;
  await removeTrainingCrops();
  const gallery = await secretKey.storage
    .from('gallery')
    .upload(galleryPart, new Uint8Array(300_000), { contentType: 'application/octet-stream', upsert: true });
  expect(gallery.error).toBeNull();
  await setStorageLimit(storageLimit);
});

afterAll(async () => {
  await secretKey.storage.from('gallery').remove([galleryPart]);
  await setStorageLimit(freePlan.storageBytes);
});

function setStorageLimit(bytes: number) {
  return asDatabaseOwner((database) => database`update private.storage_limit set bytes = ${bytes}`);
}

describe('pulling training crops', () => {
  const crops = [
    evidenceRecord(),
    evidenceRecord({
      accepted: false,
      decision_basis: null,
      art_margin: null,
      recognized_printing_id: angelicCurator,
      saved_printing_id: delverInnistrad,
      printing_change: 'name_search',
    }),
  ];
  const jpegCrop = evidenceRecord();
  const storedCrops = [...crops, jpegCrop];
  const later = evidenceRecord({ printing_confirmed: true });
  const images = new Map<string, Uint8Array<ArrayBuffer>>();
  let folder: string;
  let first: Awaited<ReturnType<typeof runCropsCommand>>;

  function fileName(crop: TrainingCrop) {
    return crop === jpegCrop ? `${crop.crop_id}.jpg` : `${crop.crop_id}.webp`;
  }

  beforeAll(async () => {
    for (const crop of crops) {
      images.set(crop.crop_id, await stored(crop));
    }
    images.set(jpegCrop.crop_id, await storedAsJpegBeforeTheSwitchToWebp(jpegCrop));
    await stored(evidenceRecord(), { withImage: false });
    folder = await mkdtemp(join(tmpdir(), 'mtgscan-training-crops-'));
    first = await runCropsCommand('pull', '--into', folder);
  });

  test('the first pull downloads every stored training crop image, each WebP as <crop ID>.webp', async () => {
    expect(first.exitCode).toBe(0);
    expect((await readdir(join(folder, 'crops'))).sort()).toEqual(storedCrops.map(fileName).sort());
    for (const crop of crops) {
      expect(new Uint8Array(await readFile(join(folder, 'crops', `${crop.crop_id}.webp`)))).toEqual(images.get(crop.crop_id)!);
    }
  });

  test('a training crop stored as a JPEG before the switch to WebP is pulled as <crop ID>.jpg', async () => {
    expect(new Uint8Array(await readFile(join(folder, 'crops', `${jpegCrop.crop_id}.jpg`)))).toEqual(images.get(jpegCrop.crop_id)!);
  });

  test('the labels file lists each crop with its saved card printing, in the scanner evidence pack format', async () => {
    expect(await readJson(folder, 'labels.json')).toEqual({
      cards: byCropId(storedCrops).map((crop) => ({ crop: `crops/${fileName(crop)}`, scryfallId: crop.saved_printing_id })),
    });
  });

  test('the evidence file holds the evidence record of each crop', async () => {
    expect(await readJson(folder, 'evidence.json')).toEqual(byCropId(storedCrops));
  });

  test('the pull prints the number of crops, their total size, and the Storage left before the 90% stop of the database Storage limit', async () => {
    const left = ((0.9 * storageLimit - (await storageBytes())) / 1_000_000).toFixed(1);

    expect(first.output).toContain('Downloaded 3 new training crops.');
    expect(first.output).toContain(`${folder} holds 3 training crops, 0.6 MB.`);
    expect(first.output).toContain(`${left} MB of Storage is left before training crop uploads stop at 90%.`);
  });

  test('a second pull downloads only the crops that are not on the Mac yet', async () => {
    const kept = join(folder, 'crops', `${crops[0]!.crop_id}.webp`);
    await writeFile(kept, 'kept on the Mac');
    images.set(later.crop_id, await stored(later));

    const second = await runCropsCommand('pull', '--into', folder);

    expect(second.exitCode).toBe(0);
    expect(second.output).toContain('Downloaded 1 new training crop.');
    expect(await readFile(kept, 'utf8')).toBe('kept on the Mac');
    expect(new Uint8Array(await readFile(join(folder, 'crops', `${later.crop_id}.webp`)))).toEqual(images.get(later.crop_id)!);
    expect((await readJson(folder, 'labels.json')).cards).toHaveLength(4);
    expect(await readJson(folder, 'evidence.json')).toEqual(byCropId([...storedCrops, later]));
  });

  test('a pull with nothing new downloads nothing', async () => {
    const third = await runCropsCommand('pull', '--into', folder);

    expect(third.exitCode).toBe(0);
    expect(third.output).toContain('Downloaded 0 new training crops.');
  });
});
