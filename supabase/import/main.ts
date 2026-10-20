import { parseArgs } from 'node:util';

import { commanderSpellbook, commanderSpellbookVariantsUrl } from './commander-spellbook';
import { recomputeBehindDeckEvaluations, recomputeDeckEvaluations } from './deck-evaluations';
import { frankfurterExchangeRates, frankfurterLatestRatesUrl } from './frankfurter-exchange-rates';
import { importClientFromEnvironment } from './import-client';
import { ImportFailed, provisionalBatchLimits, runImport, type ImportClient, type ImportRun, type ImportSource } from './import-run';
import { scryfallManifestUrl } from './scryfall-bulk-data';
import { scryfallCatalog } from './scryfall-catalog';
import { scryfallOracleTags } from './scryfall-oracle-tags';
import { scryfallPrices } from './scryfall-prices';
import { importCardSets, scryfallSetsUrl } from './scryfall-sets';
import { importSetSections, scryfallApiUrl, scryfallSiteUrl } from './scryfall-set-sections';
import { type ImportAdapters, retryFailedWeeklySources } from './weekly-retry';

const usage = `Usage:
  bun import/main.ts catalog [--manifest <path or URL>] [--sets <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts oracle_tags|prices [--manifest <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts commander_spellbook [--variants <path or URL>] [--accept-shrink] [--batch-rows <n>]
  bun import/main.ts exchange_rates [--rates <path or URL>] [--accept-shrink]
  bun import/main.ts set_sections [--scryfall-site <URL>] [--scryfall-api <URL>]
  bun import/main.ts retry-weekly [--manifest <path or URL>] [--variants <path or URL>] [--batch-rows <n>]
  bun import/main.ts deck-evaluations
  bun import/main.ts prune-telemetry`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    manifest: { type: 'string', default: scryfallManifestUrl },
    variants: { type: 'string', default: commanderSpellbookVariantsUrl },
    sets: { type: 'string', default: scryfallSetsUrl },
    rates: { type: 'string', default: frankfurterLatestRatesUrl },
    'scryfall-site': { type: 'string', default: scryfallSiteUrl },
    'scryfall-api': { type: 'string', default: scryfallApiUrl },
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
  exchange_rates: () => frankfurterExchangeRates(values.rates),
} satisfies ImportAdapters;

async function pruneSearchTelemetry(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('prune_search_telemetry');
  if (error) {
    throw new ImportFailed(`Prune telemetry: ${error.message}`);
  }
  console.log(`Deleted ${data} search telemetry rows older than 180 days.`);
}

const importOptions = { acceptShrink: values['accept-shrink'], batchLimits };
const rulesDataSources: ImportSource[] = ['catalog', 'oracle_tags', 'commander_spellbook'];

async function recomputeAfterImport(client: ImportClient, run: ImportRun): Promise<void> {
  if (rulesDataSources.includes(run.source) && run.status === 'succeeded') {
    await recomputeDeckEvaluations(client);
  }
}

const commands: Record<string, (client: ImportClient) => Promise<unknown>> = {
  ...Object.fromEntries(
    Object.entries(adapters).map(([source, adapter]) => [
      source,
      async (client: ImportClient) =>
        recomputeAfterImport(client, await runImport(client, await adapter(), importOptions)),
    ]),
  ),
  catalog: async (client: ImportClient) => {
    const run = await runImport(client, await adapters.catalog(), importOptions);
    await importCardSets(client, values.sets);
    await recomputeAfterImport(client, run);
  },
  set_sections: (client: ImportClient) =>
    importSetSections(client, { site: values['scryfall-site'], api: values['scryfall-api'] }),
  'retry-weekly': (client) => retryFailedWeeklySources(client, adapters, batchLimits),
  'deck-evaluations': recomputeBehindDeckEvaluations,
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
