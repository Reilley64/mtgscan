import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildRecognizer } from '../../apps/mobile/modules/card-recognizer/scripts/recognizer-command.mjs';
import { featurePrintDimension } from './format';

export type RecognizerAbout = {
  macOS: string;
  machine: string;
  featurePrintRevision: number;
  dimension: number;
};

export type Recognizer = {
  about: RecognizerAbout;
  encode: (images: string[]) => Promise<Uint8Array>;
  install: (versionDirectory: string, galleryDirectory: string) => Promise<void>;
};

async function run(command: string, args: string[]): Promise<string> {
  const child = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'inherit' });
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (exitCode !== 0) {
    throw new Error(`The recognizer command failed: ${args[0]} exited with ${exitCode}`);
  }
  return stdout;
}

export async function macRecognizer(): Promise<Recognizer> {
  const command = process.env.GALLERY_RECOGNIZER ?? (await buildRecognizer());
  const about = JSON.parse(await run(command, ['about'])) as RecognizerAbout;
  if (about.dimension !== featurePrintDimension) {
    throw new Error(`The recognizer makes ${about.dimension} values, the gallery needs ${featurePrintDimension}`);
  }
  return {
    about,
    async encode(images) {
      if (images.length === 0) {
        return new Uint8Array();
      }
      const directory = await mkdtemp(join(tmpdir(), 'mtgscan-gallery-encode-'));
      try {
        await writeFile(join(directory, 'images.txt'), images.join('\n'));
        await run(command, ['encode', join(directory, 'images.txt'), join(directory, 'codes.i8')]);
        const codes = new Uint8Array(await Bun.file(join(directory, 'codes.i8')).arrayBuffer());
        if (codes.length !== images.length * featurePrintDimension) {
          throw new Error(`The recognizer wrote ${codes.length} bytes for ${images.length} images`);
        }
        return codes;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async install(versionDirectory, galleryDirectory) {
      await run(command, ['install', versionDirectory, galleryDirectory]);
    },
  };
}
