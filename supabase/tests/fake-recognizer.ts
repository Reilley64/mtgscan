#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { repositoryModelFile } from '../gallery/model';

const { inputSize, vectorSize } = (await Bun.file(repositoryModelFile).json()) as { inputSize: number; vectorSize: number };
const [command, ...args] = Bun.argv.slice(2);

async function packageSha256(modelPackage: string): Promise<string> {
  const files = (await readdir(modelPackage, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(modelPackage.length + 1))
    .sort();
  const lines = await Promise.all(
    files.map(async (file) => `${createHash('sha256').update(await Bun.file(join(modelPackage, file)).bytes()).digest('hex')}  ${file}\n`),
  );
  return createHash('sha256').update(lines.join('')).digest('hex');
}

if (command === 'about' && args[0] === '--model' && args.length === 2) {
  console.log(
    JSON.stringify({
      macOS: '15.7.3',
      machine: 'Test machine',
      model: {
        name: basename(args[1]!, '.mlpackage'),
        sha256: await packageSha256(args[1]!),
        inputSize: { width: inputSize, height: inputSize },
        vectorSize,
      },
    }),
  );
} else if (command === 'encode' && args[0] === '--model' && args.length === 4) {
  const images = (await Bun.file(args[2]!).text()).split('\n').filter(Boolean);
  const codes = new Uint8Array(images.length * vectorSize);
  for (const [row, image] of images.entries()) {
    const digest = createHash('sha256').update(new Uint8Array(await Bun.file(image).arrayBuffer())).digest();
    for (let component = 0; component < vectorSize; component += 1) {
      codes[row * vectorSize + component] = digest[component % digest.length]!;
    }
  }
  await Bun.write(args[3]!, codes);
  console.log(JSON.stringify({ featurePrints: images.length }));
} else if (command === 'install' && args.length === 2) {
  await Bun.write(join(args[1]!, 'manifest.json'), Bun.file(join(args[0]!, 'manifest.json')));
} else {
  process.exit(1);
}
