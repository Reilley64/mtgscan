import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { ImportFailed, provisionalBatchLimits, runImport, type ImportClient } from './import-run';
import { scryfallManifestUrl } from './scryfall-bulk-data';
import { scryfallCatalog } from './scryfall-catalog';
import { scryfallPrices } from './scryfall-prices';
import { type ImportAdapters, retryFailedWeeklySources } from './weekly-retry';

const usage = `Usage:
  bun import/main.ts catalog|prices [--manifest <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts retry-weekly [--manifest <path or URL>] [--batch-rows <n>]
  bun import/main.ts prune-telemetry`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    manifest: { type: 'string', default: scryfallManifestUrl },
    'accept-shrink': { type: 'boolean', default: false },
    'batch-rows': { type: 'string', default: String(provisionalBatchLimits.rows) },
  },
});

const [command] = positionals;
const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const batchLimits = { ...provisionalBatchLimits, rows: Number(values['batch-rows']) };
const adapters = {
  catalog: () => scryfallCatalog(values.manifest),
  prices: () => scryfallPrices(values.manifest),
} satisfies ImportAdapters;

function isImportSource(name: string | undefined): name is keyof typeof adapters {
  return name !== undefined && Object.hasOwn(adapters, name);
}

async function pruneSearchTelemetry(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('prune_search_telemetry');
  if (error) {
    throw new ImportFailed(`Prune telemetry: ${error.message}`);
  }
  console.log(`Deleted ${data} search telemetry rows older than 180 days.`);
}

const knownCommand = isImportSource(command) || command === 'retry-weekly' || command === 'prune-telemetry';
if (!knownCommand || !Number.isInteger(batchLimits.rows) || batchLimits.rows < 1) {
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
  if (isImportSource(command)) {
    await runImport(client, await adapters[command](), { acceptShrink: values['accept-shrink'], batchLimits });
  } else if (command === 'retry-weekly') {
    await retryFailedWeeklySources(client, adapters, batchLimits);
  } else {
    await pruneSearchTelemetry(client);
  }
} catch (error) {
  console.error(error instanceof ImportFailed ? error.message : error);
  process.exit(1);
}
