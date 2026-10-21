import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from '../import/import-client';
import { scryfallManifestUrl } from '../import/scryfall-bulk-data';
import { hostedSupabaseUrl, isLocalStack, localSupabaseUrl } from '../test-user/account';
import { buildGallery } from './build';
import { galleryStatus, installGallery, publishGallery, recordParityCheck, signVersion } from './publish';
import { convertedModel, repositoryModelFile } from './model';
import { macRecognizer } from './recognizer';
import { GalleryRefused } from './storage';

const cacheDirectory = join(homedir(), 'Library', 'Caches', 'mtgscan');

const usage = `Usage:
  bun gallery/main.ts build [--hosted] [--manifest <path or URL>] [--images <dir>] [--work <dir>] [--model-file <model.json>] [--models <dir>] [--new-base] [--cached-images-bulk-file <default-cards.jsonl.gz>]
  bun gallery/main.ts parity <version> [--hosted] --lowest-cosine <n> --mean-cosine <n> --references <n>
  bun gallery/main.ts sign <version> [--hosted] [--hours <n>]
  bun gallery/main.ts publish <version> [--hosted]
  bun gallery/main.ts install <version> [--hosted] [--gallery <dir>] [--work <dir>]
  bun gallery/main.ts status [--hosted]`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    hosted: { type: 'boolean', default: false },
    manifest: { type: 'string', default: scryfallManifestUrl },
    images: { type: 'string', default: join(cacheDirectory, 'scryfall-images') },
    work: { type: 'string' },
    'model-file': { type: 'string', default: repositoryModelFile },
    models: { type: 'string', default: join(cacheDirectory, 'models') },
    gallery: { type: 'string' },
    'new-base': { type: 'boolean', default: false },
    'cached-images-bulk-file': { type: 'string' },
    'lowest-cosine': { type: 'string' },
    'mean-cosine': { type: 'string' },
    references: { type: 'string' },
    hours: { type: 'string', default: '24' },
  },
});

const [command, version] = positionals;
const parity = {
  lowestCosine: Number(values['lowest-cosine']),
  meanCosine: Number(values['mean-cosine']),
  references: Number(values.references),
};
const versionCommands = new Set(['parity', 'sign', 'publish', 'install']);
const hours = Number(values.hours);
const valid =
  (command === 'build' && positionals.length === 1) ||
  (command === 'status' && positionals.length === 1) ||
  (versionCommands.has(command ?? '') && positionals.length === 2);
const optionsValid =
  (command !== 'parity' || Object.values(parity).every((value) => Number.isFinite(value))) &&
  Number.isFinite(hours) &&
  hours > 0 &&
  hours <= 168;

if (!valid || !optionsValid) {
  console.error(usage);
  process.exit(2);
}

function supabaseUrl(): string {
  if (values.hosted) {
    const hosted = hostedSupabaseUrl(process.env);
    if ('refusal' in hosted) {
      refuse(hosted.refusal);
    }
    return hosted.url;
  }
  const url = process.env.SUPABASE_URL || localSupabaseUrl;
  if (!isLocalStack(url)) {
    refuse(`Without --hosted, the gallery commands use only the local stack, and ${url} is not local. Add --hosted for the hosted project.`);
  }
  return url;
}

function refuse(message: string): never {
  console.error(message);
  console.error(usage);
  process.exit(2);
}

function nextSteps(version: string): string {
  return values.hosted
    ? `Next: run the parity check on the iPhone, record it with \`bun --env-file=.env.hosted gallery/main.ts parity ${version} --hosted --lowest-cosine <n> --mean-cosine <n> --references <n>\`, then \`bun --env-file=.env.hosted gallery/main.ts publish ${version} --hosted\`.`
    : `Next: unpack it for the scanner evidence replay with \`bun run gallery install ${version}\`.`;
}

const url = supabaseUrl();
const workDirectory = values.work ?? join(cacheDirectory, values.hosted ? 'gallery' : 'local-gallery');
let connected: ReturnType<typeof importClientFromEnvironment> | undefined;
const client = () => (connected ??= importClientFromEnvironment(url));

try {
  switch (command) {
    case 'build': {
      const model = await convertedModel(values['model-file'], values.models);
      const manifest = await buildGallery(client(), await macRecognizer(model.modelPackage), model, {
        manifestLocation: values.manifest,
        imagesDirectory: values.images,
        workDirectory,
        newBase: values['new-base'],
        cachedImagesBulkFile: values['cached-images-bulk-file'],
      });
      if (manifest) {
        console.log(nextSteps(manifest.version));
      }
      break;
    }
    case 'parity':
      await recordParityCheck(client(), version!, parity);
      break;
    case 'sign':
      await signVersion(client(), version!, hours);
      break;
    case 'publish':
      await publishGallery(client(), version!);
      break;
    case 'install':
      await installGallery(client, workDirectory, version!, values.gallery ?? join(workDirectory, 'installed', version!));
      break;
    case 'status':
      await galleryStatus(client());
      break;
  }
} catch (error) {
  console.error(error instanceof GalleryRefused ? error.message : error);
  process.exit(1);
}
