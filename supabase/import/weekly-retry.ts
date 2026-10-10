import type { Database } from '../database.types';
import { type BatchLimits, type ImportAdapter, type ImportClient, ImportFailed, runImport } from './import-run';

type ImportSource = Database['public']['Enums']['import_source'];
type ImportRunStatus = Database['public']['Enums']['import_run_status'];

export type ImportAdapters = Partial<Record<ImportSource, () => Promise<ImportAdapter>>>;

const weeklySources: ImportSource[] = ['catalog', 'oracle_tags', 'commander_spellbook', 'card_embeddings'];
const failedStatuses: ImportRunStatus[] = ['failed', 'expired'];

export async function retryFailedWeeklySources(
  client: ImportClient,
  adapters: ImportAdapters,
  batchLimits: BatchLimits,
): Promise<void> {
  const { data, error } = await client.rpc('catalog_freshness');
  if (error) {
    throw new ImportFailed(`Freshness: ${error.message}`);
  }
  const failedSources = data
    .filter(
      (row) =>
        weeklySources.includes(row.source) &&
        row.last_attempt_status !== null &&
        failedStatuses.includes(row.last_attempt_status),
    )
    .map((row) => row.source);
  if (failedSources.length === 0) {
    console.log('No weekly source needs a retry.');
    return;
  }

  const failures: string[] = [];
  for (const source of failedSources) {
    console.log(`Retrying the ${source} import because its latest run failed.`);
    try {
      const adapter = adapters[source];
      if (!adapter) {
        throw new ImportFailed(`No import exists for the ${source} source.`);
      }
      await runImport(client, await adapter(), { acceptShrink: false, batchLimits });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new ImportFailed(failures.join('\n'));
  }
}
