import { existsSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { FeaturePrintModel, RecognizerThresholds } from './manifest';
import { GalleryRefused } from './storage';

export const repositoryModelFile = join(import.meta.dir, '..', '..', 'apps', 'mobile', 'modules', 'card-recognizer', 'model.json');

type ModelFile = {
  name: string;
  sha256: string;
  inputSize: number;
  vectorSize: number;
  thresholds: RecognizerThresholds;
};

export type ConvertedModel = {
  modelFile: string;
  modelPackage: string;
  model: FeaturePrintModel;
  thresholds: RecognizerThresholds;
};

export async function convertedModel(modelFile: string, modelsDirectory: string): Promise<ConvertedModel> {
  const file = (await Bun.file(modelFile).json()) as ModelFile;
  const modelPackage = join(modelsDirectory, `${file.name}.mlpackage`);
  if (!existsSync(modelPackage)) {
    throw new GalleryRefused(`The converted model ${modelPackage} that ${modelFile} names is not on this Mac. Convert it with scripts/convert-model.py in the card recognizer module.`);
  }
  return {
    modelFile,
    modelPackage,
    model: {
      name: file.name,
      sha256: file.sha256,
      inputSize: { width: file.inputSize, height: file.inputSize },
      vectorSize: file.vectorSize,
    },
    thresholds: file.thresholds,
  };
}

const blockSize = 512;
const archiveRoot = 'model.mlpackage';
const encoder = new TextEncoder();

function octal(header: Uint8Array, offset: number, length: number, value: number) {
  header.set(encoder.encode(`${value.toString(8).padStart(length - 1, '0')}\0`), offset);
}

function tarHeader(path: string, size: number, directory: boolean): Uint8Array {
  const name = encoder.encode(path);
  if (name.length > 100) {
    throw new Error(`${path} is longer than the 100 bytes of a tar entry name`);
  }
  const header = new Uint8Array(blockSize);
  header.set(name, 0);
  octal(header, 100, 8, directory ? 0o755 : 0o644);
  octal(header, 108, 8, 0);
  octal(header, 116, 8, 0);
  octal(header, 124, 12, size);
  octal(header, 136, 12, 0);
  header[156] = encoder.encode(directory ? '5' : '0')[0]!;
  header.set(encoder.encode('ustar\0'), 257);
  header.set(encoder.encode('00'), 263);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148);
  return header;
}

export async function modelArchive(modelPackage: string): Promise<Uint8Array> {
  const relative = await readdir(modelPackage, { recursive: true });
  const entries = ['', ...relative].sort();
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const path = entry ? `${archiveRoot}/${entry}` : archiveRoot;
    const source = join(modelPackage, entry);
    const stats = await lstat(source);
    if (stats.isDirectory()) {
      blocks.push(tarHeader(`${path}/`, 0, true));
    } else if (stats.isFile()) {
      const bytes = await Bun.file(source).bytes();
      blocks.push(tarHeader(path, bytes.length, false), bytes, new Uint8Array((blockSize - (bytes.length % blockSize)) % blockSize));
    } else {
      throw new Error(`${source} is neither a file nor a folder`);
    }
  }
  blocks.push(new Uint8Array(2 * blockSize));
  const archive = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    archive.set(block, offset);
    offset += block.length;
  }
  return archive;
}
