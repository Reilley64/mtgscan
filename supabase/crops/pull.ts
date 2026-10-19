import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Database } from '../database.types';
import { freePlan } from '../gallery/budget';
import { megabytes } from '../gallery/manifest';
import type { ImportClient } from '../import/import-run';

type TrainingCrop = Database['public']['Tables']['training_crops']['Row'];

type StoredObject = { name: string; bytes: number };

const trainingCropsBucket = 'training-crops';
const uploadStop = 0.9;
const pageSize = 1000;
const parallelDownloads = 8;

async function listedObjects(client: ImportClient, bucket: string, prefix = ''): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    }
    for (const entry of data) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        objects.push(...(await listedObjects(client, bucket, name)));
      } else {
        objects.push({ name, bytes: Number(entry.metadata?.size ?? 0) });
      }
    }
    if (data.length < pageSize) {
      return objects;
    }
  }
}

async function storageBytes(client: ImportClient): Promise<number> {
  const { data, error } = await client.storage.listBuckets();
  if (error) {
    throw new Error(`Could not list the Storage buckets: ${error.message}`);
  }
  let bytes = 0;
  for (const bucket of data) {
    for (const object of await listedObjects(client, bucket.id)) {
      bytes += object.bytes;
    }
  }
  return bytes;
}

async function evidenceRecords(client: ImportClient): Promise<TrainingCrop[]> {
  const records: TrainingCrop[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('training_crops')
      .select('*')
      .order('crop_id')
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Could not read the training crops: ${error.message}`);
    }
    records.push(...data);
    if (data.length < pageSize) {
      return records;
    }
  }
}

function cropPath(crop: TrainingCrop): string {
  return `crops/${crop.crop_id}.jpg`;
}

async function download(client: ImportClient, crop: TrainingCrop, folder: string) {
  const { data, error } = await client.storage.from(trainingCropsBucket).download(`${crop.crop_id}.jpg`);
  if (error || !data) {
    throw new Error(`Could not download training crop ${crop.crop_id}: ${error?.message ?? 'no data'}`);
  }
  const file = join(folder, cropPath(crop));
  await writeFile(`${file}.part`, new Uint8Array(await data.arrayBuffer()));
  await rename(`${file}.part`, file);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export async function pullTrainingCrops(client: ImportClient, folder: string) {
  const images = new Map((await listedObjects(client, trainingCropsBucket)).map((object) => [object.name, object.bytes]));
  const crops = (await evidenceRecords(client)).filter((crop) => images.has(`${crop.crop_id}.jpg`));
  const missing = crops.filter((crop) => !existsSync(join(folder, cropPath(crop))));
  await mkdir(join(folder, 'crops'), { recursive: true });
  for (let next = 0; next < missing.length; next += parallelDownloads) {
    await Promise.all(missing.slice(next, next + parallelDownloads).map((crop) => download(client, crop, folder)));
  }
  const labels = { cards: crops.map((crop) => ({ crop: cropPath(crop), scryfallId: crop.saved_printing_id })) };
  await writeFile(join(folder, 'labels.json'), `${JSON.stringify(labels, null, 1)}\n`);
  await writeFile(join(folder, 'evidence.json'), `${JSON.stringify(crops, null, 1)}\n`);

  const cropBytes = crops.reduce((sum, crop) => sum + images.get(`${crop.crop_id}.jpg`)!, 0);
  const left = freePlan.storageBytes * uploadStop - (await storageBytes(client));
  console.log(`Downloaded ${plural(missing.length, 'new training crop')}.`);
  console.log(`${folder} holds ${plural(crops.length, 'training crop')}, ${megabytes(cropBytes)}.`);
  console.log(`${megabytes(left)} of Storage is left before training crop uploads stop at 90%.`);
}
