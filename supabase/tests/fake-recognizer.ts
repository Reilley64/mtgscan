#!/usr/bin/env bun
import { createHash } from 'node:crypto';

const dimension = 768;
const [command, ...args] = Bun.argv.slice(2);

if (command === 'about') {
  console.log(JSON.stringify({ macOS: '15.7.3', machine: 'Test machine', featurePrintRevision: 2, dimension }));
} else if (command === 'encode' && args.length === 2) {
  const images = (await Bun.file(args[0]!).text()).split('\n').filter(Boolean);
  const codes = new Uint8Array(images.length * dimension);
  for (const [row, image] of images.entries()) {
    const digest = createHash('sha256').update(new Uint8Array(await Bun.file(image).arrayBuffer())).digest();
    for (let component = 0; component < dimension; component += 1) {
      codes[row * dimension + component] = digest[component % digest.length]!;
    }
  }
  await Bun.write(args[1]!, codes);
  console.log(JSON.stringify({ featurePrints: images.length }));
} else {
  process.exit(1);
}
