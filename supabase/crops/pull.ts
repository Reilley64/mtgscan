import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';

import { trainingCropsBucket } from '../functions/training-crops/crop-object';
import { plural } from '../functions/mcp/plural';
import { megabytes } from '../gallery/manifest';
import { inPool } from '../gallery/pool';
import type { ImportClient } from '../import/import-run';
import type { TrainingCrop, TrainingCropStorage } from '../training-crops';

const pageSize = 1000;
const parallelDownloads = 8;

type StoredImage = { name: string; bytes: number };

async function storedImages(client: ImportClient): Promise<Map<string, StoredImage>> {
  const images = new Map<string, StoredImage>();
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage
      .from(trainingCropsBucket)
      .list('', { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      throw new Error(`Could not list ${trainingCropsBucket}: ${error.message}`);
    }
    for (const entry of data) {
      images.set(parse(entry.name).name, { name: entry.name, bytes: Number(entry.metadata?.size ?? 0) });
    }
    if (data.length < pageSize) {
      return images;
    }
  }
}

async function storageLeft(client: ImportClient): Promise<number> {
  const { data, error } = await client.rpc('get_training_crop_storage');
  if (error) {
    throw new Error(`Could not read the Storage left: ${error.message}`);
  }
  return (data as unknown as TrainingCropStorage).bytes_left;
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

function cropPath(image: StoredImage): string {
  return `crops/${image.name}`;
}

async function download(client: ImportClient, image: StoredImage, folder: string) {
  const { data, error } = await client.storage.from(trainingCropsBucket).download(image.name);
  if (error || !data) {
    throw new Error(`Could not download training crop ${image.name}: ${error?.message ?? 'no data'}`);
  }
  const file = join(folder, cropPath(image));
  await writeFile(`${file}.part`, new Uint8Array(await data.arrayBuffer()));
  await rename(`${file}.part`, file);
}

export async function pullTrainingCrops(client: ImportClient, folder: string) {
  const images = await storedImages(client);
  const crops = (await evidenceRecords(client)).filter((crop) => images.has(crop.crop_id));
  const imageOf = (crop: TrainingCrop) => images.get(crop.crop_id)!;
  const missing = crops.map(imageOf).filter((image) => !existsSync(join(folder, cropPath(image))));
  await mkdir(join(folder, 'crops'), { recursive: true });
  await inPool(missing, parallelDownloads, (image) => download(client, image, folder));
  const labels = {
    cards: crops.map((crop) => ({
      crop: cropPath(imageOf(crop)),
      scryfallId: crop.saved_printing_id,
      featurePrintModel: crop.feature_print_model,
    })),
  };
  await writeFile(join(folder, 'labels.json'), `${JSON.stringify(labels, null, 1)}\n`);
  await writeFile(join(folder, 'evidence.json'), `${JSON.stringify(crops, null, 1)}\n`);

  const cropBytes = crops.reduce((sum, crop) => sum + imageOf(crop).bytes, 0);
  console.log(`Downloaded ${plural(missing.length, 'new training crop')}.`);
  console.log(`${folder} holds ${plural(crops.length, 'training crop')}, ${megabytes(cropBytes)}.`);
  console.log(`${megabytes(await storageLeft(client))} of Storage is left before training crop uploads stop at 90%.`);
}
