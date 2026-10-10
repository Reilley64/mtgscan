import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from './import-client';
import { ImportFailed, provisionalBatchLimits, runImport, type ImportClient } from './import-run';
import { scryfallManifestUrl } from './scryfall-bulk-data';
import { scryfallCatalog } from './scryfall-catalog';
import { scryfallOracleTags } from './scryfall-oracle-tags';
import { scryfallPrices } from './scryfall-prices';
import { type ImportAdapters, retryFailedWeeklySources } from './weekly-retry';

const usage = `Usage:
  bun import/main.ts catalog|oracle_tags|prices [--manifest <path or URL>] [--accept-shrink] [--batch-rows <n>]
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
const batchLimits = { ...provisionalBatchLimits, rows: Number(values['batch-rows']) };
const adapters = {
  catalog: () => scryfallCatalog(values.manifest),
  oracle_tags: () => scryfallOracleTags(values.manifest),
  prices: () => scryfallPrices(values.manifest),
} satisfies ImportAdapters;

async function pruneSearchTelemetry(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('prune_search_telemetry');
  if (error) {
    throw new ImportFailed(`Prune telemetry: ${error.message}`);
  }
  console.log(`Deleted ${data} search telemetry rows older than 180 days.`);
}

const commands: Record<string, (client: ImportClient) => Promise<unknown>> = {
  catalog: async (client) =>
    runImport(client, await adapters.catalog(), { acceptShrink: values['accept-shrink'], batchLimits }),
  oracle_tags: async (client) =>
    runImport(client, await adapters.oracle_tags(), { acceptShrink: values['accept-shrink'], batchLimits }),
  prices: async (client) =>
    runImport(client, await adapters.prices(), { acceptShrink: values['accept-shrink'], batchLimits }),
  'retry-weekly': (client) => retryFailedWeeklySources(client, adapters, batchLimits),
  'prune-telemetry': pruneSearchTelemetry,
};
const run = command === undefined ? undefined : commands[command];

if (!run || !Number.isInteger(batchLimits.rows) || batchLimits.rows < 1) {
  console.error(usage);
  process.exit(2);
}

const client = importClientFromEnvironment();

try {
  await run(client);
} catch (error) {
  console.error(error instanceof ImportFailed ? error.message : error);
  process.exit(1);
}
