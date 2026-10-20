#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dimension = 768;
const [command, ...args] = Bun.argv.slice(2);

if (command === 'about') {
  console.log(
    JSON.stringify({
      macOS: '15.7.3',
      machine: 'Test machine',
      model: { name: process.env.FAKE_RECOGNIZER_MODEL ?? 'apple-vision-2', inputSize: { width: 488, height: 680 }, vectorSize: dimension },
      thresholds: { notACard: 0.5, orientationMargin: 0.03, artMargin: 0.03 },
    }),
  );
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
} else if (command === 'install' && args.length === 2) {
  await Bun.write(join(args[1]!, 'manifest.json'), Bun.file(join(args[0]!, 'manifest.json')));
} else {
  process.exit(1);
}
