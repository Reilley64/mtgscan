import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { ImportFailed, provisionalBatchLimits, runImport } from './import-run';
import { scryfallCatalog, scryfallManifestUrl } from './scryfall-catalog';

const usage = 'Usage: bun import/main.ts catalog [--manifest <path or URL>] [--accept-shrink] [--batch-rows <n>]';

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    manifest: { type: 'string', default: scryfallManifestUrl },
    'accept-shrink': { type: 'boolean', default: false },
    'batch-rows': { type: 'string', default: String(provisionalBatchLimits.rows) },
  },
});

const [source] = positionals;
const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const batchRows = Number(values['batch-rows']);

if (source !== 'catalog' || !Number.isInteger(batchRows) || batchRows < 1) {
  console.error(usage);
  process.exit(2);
}
if (!url || !secretKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  process.exit(2);
}

const client = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  await runImport(client, await scryfallCatalog(values.manifest), {
    acceptShrink: values['accept-shrink'],
    batchLimits: { ...provisionalBatchLimits, rows: batchRows },
  });
} catch (error) {
  console.error(error instanceof ImportFailed ? error.message : error);
  process.exit(1);
}
