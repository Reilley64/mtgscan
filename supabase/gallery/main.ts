import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from '../import/import-client';
import { scryfallManifestUrl } from '../import/scryfall-bulk-data';
import { buildGallery } from './build';
import { galleryStatus, installGallery, publishGallery, recordParityCheck } from './publish';
import { macRecognizer } from './recognizer';
import { GalleryRefused } from './storage';

const cacheDirectory = join(homedir(), 'Library', 'Caches', 'mtgscan');

const usage = `Usage:
  bun gallery/main.ts build [--manifest <path or URL>] [--images <dir>] [--work <dir>] [--new-base] [--cached-images-bulk-file <default-cards.jsonl.gz>]
  bun gallery/main.ts parity <version> --lowest-cosine <n> --mean-cosine <n> --references <n>
  bun gallery/main.ts publish <version>
  bun gallery/main.ts install <version> [--gallery <dir>] [--work <dir>]
  bun gallery/main.ts status`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    manifest: { type: 'string', default: scryfallManifestUrl },
    images: { type: 'string', default: join(cacheDirectory, 'scryfall-images') },
    work: { type: 'string', default: join(cacheDirectory, 'gallery') },
    gallery: { type: 'string' },
    'new-base': { type: 'boolean', default: false },
    'cached-images-bulk-file': { type: 'string' },
    'lowest-cosine': { type: 'string' },
    'mean-cosine': { type: 'string' },
    references: { type: 'string' },
  },
});

const [command, version] = positionals;
const parity = {
  lowestCosine: Number(values['lowest-cosine']),
  meanCosine: Number(values['mean-cosine']),
  references: Number(values.references),
};
const versionCommands = new Set(['parity', 'publish', 'install']);
const valid =
  (command === 'build' && positionals.length === 1) ||
  (command === 'status' && positionals.length === 1) ||
  (versionCommands.has(command ?? '') && positionals.length === 2);
const parityValid = command !== 'parity' || Object.values(parity).every((value) => Number.isFinite(value));

if (!valid || !parityValid) {
  console.error(usage);
  process.exit(2);
}

const client = importClientFromEnvironment();

try {
  switch (command) {
    case 'build':
      await buildGallery(client, await macRecognizer(), {
        manifestLocation: values.manifest,
        imagesDirectory: values.images,
        workDirectory: values.work,
        newBase: values['new-base'],
        cachedImagesBulkFile: values['cached-images-bulk-file'],
      });
      break;
    case 'parity':
      await recordParityCheck(client, version!, parity);
      break;
    case 'publish':
      await publishGallery(client, version!);
      break;
    case 'install':
      await installGallery(client, await macRecognizer(), values.work, version!, values.gallery ?? join(values.work, 'installed', version!));
      break;
    case 'status':
      await galleryStatus(client);
      break;
  }
} catch (error) {
  console.error(error instanceof GalleryRefused ? error.message : error);
  process.exit(1);
}
