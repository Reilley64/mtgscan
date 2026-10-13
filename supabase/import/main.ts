import { parseArgs } from 'node:util';

import { commanderSpellbook, commanderSpellbookVariantsUrl } from './commander-spellbook';
import { importClientFromEnvironment } from './import-client';
import { ImportFailed, provisionalBatchLimits, runImport, type ImportClient } from './import-run';
import { scryfallManifestUrl } from './scryfall-bulk-data';
import { scryfallCatalog } from './scryfall-catalog';
import { scryfallOracleTags } from './scryfall-oracle-tags';
import { scryfallPrices } from './scryfall-prices';
import { importCardSets, scryfallSetsUrl } from './scryfall-sets';
import { type ImportAdapters, retryFailedWeeklySources } from './weekly-retry';

const usage = `Usage:
  bun import/main.ts catalog [--manifest <path or URL>] [--sets <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts oracle_tags|prices [--manifest <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts commander_spellbook [--variants <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts retry-weekly [--manifest <path or URL>] [--variants <path or URL>] [--batch-rows <n>]
  bun import/main.ts prune-telemetry
  bun import/main.ts collection-totals`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    manifest: { type: 'string', default: scryfallManifestUrl },
    variants: { type: 'string', default: commanderSpellbookVariantsUrl },
    sets: { type: 'string', default: scryfallSetsUrl },
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
  commander_spellbook: () => commanderSpellbook(values.variants),
} satisfies ImportAdapters;

async function pruneSearchTelemetry(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('prune_search_telemetry');
  if (error) {
    throw new ImportFailed(`Prune telemetry: ${error.message}`);
  }
  console.log(`Deleted ${data} search telemetry rows older than 180 days.`);
}

async function recordDailyCollectionTotals(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('record_daily_collection_totals');
  if (error) {
    throw new ImportFailed(`Record daily collection totals: ${error.message}`);
  }
  console.log(`Recorded ${data} daily collection totals.`);
}

const commands: Record<string, (client: ImportClient) => Promise<unknown>> = {
  ...Object.fromEntries(
    Object.entries(adapters).map(([source, adapter]) => [
      source,
      async (client: ImportClient) =>
        runImport(client, await adapter(), { acceptShrink: values['accept-shrink'], batchLimits }),
    ]),
  ),
  catalog: async (client: ImportClient) => {
    await runImport(client, await adapters.catalog(), { acceptShrink: values['accept-shrink'], batchLimits });
    await importCardSets(client, values.sets);
  },
  'retry-weekly': (client) => retryFailedWeeklySources(client, adapters, batchLimits),
  'prune-telemetry': pruneSearchTelemetry,
  'collection-totals': recordDailyCollectionTotals,
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
