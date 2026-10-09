import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '../database.types';

export type ImportClient = SupabaseClient<Database>;
type ImportSource = Database['public']['Enums']['import_source'];
type ImportRun = Database['public']['Tables']['import_runs']['Row'];

export type StagedRow = {
  target: string;
  row: Record<string, Json>;
};

export type ImportAdapter = {
  source: ImportSource;
  sourceUpdatedAt: Date;
  rows: () => AsyncIterable<StagedRow>;
};

export type BatchLimits = {
  rows: number;
  bytes: number;
};

export const provisionalBatchLimits: BatchLimits = { rows: 1000, bytes: 1_000_000 };

const retriesPerBatch = 3;

type TargetProgress = {
  pendingRows: Json[];
  pendingBytes: number;
  batches: number;
  stagedRows: number;
  totalMs: number;
  maxMs: number;
};

export class ImportFailed extends Error {}

async function rpcResult<T>(
  description: string,
  request: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request();
  if (error) {
    throw new ImportFailed(`${description}: ${error.message}`);
  }
  return data as T;
}

async function withRetries<T>(attempt: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (retry === retriesPerBatch) {
        throw error;
      }
      await Bun.sleep(1000 * 2 ** retry);
    }
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export async function runImport(
  client: ImportClient,
  adapter: ImportAdapter,
  options: { acceptShrink: boolean; batchLimits: BatchLimits },
): Promise<ImportRun> {
  const run = await rpcResult<ImportRun>('Begin', () =>
    client.rpc('begin_import_run', {
      source: adapter.source,
      source_updated_at: adapter.sourceUpdatedAt.toISOString(),
      accept_shrink: options.acceptShrink,
    }),
  );
  if (run.status === 'skipped') {
    console.log(
      `Skipped the ${adapter.source} import: the source file from ${run.source_updated_at} is not newer than the last good snapshot.`,
    );
    return run;
  }
  console.log(`Started ${adapter.source} import run ${run.id} for the snapshot from ${run.source_updated_at}.`);

  try {
    const stagedRows = await stageRows(client, run.id, adapter.rows(), options.batchLimits);
    const mergeStartedAt = performance.now();
    const finished = await rpcResult<ImportRun>('Finish', () =>
      client.rpc('finish_import_run', { run_id: run.id, staged_rows: stagedRows }),
    );
    console.log(`Finish call: ${Math.round(performance.now() - mergeStartedAt)} ms.`);
    if (finished.status !== 'succeeded') {
      throw new ImportFailed(`The ${adapter.source} import run failed: ${finished.failure_reason}`);
    }
    console.log(`Merge time: ${finished.merge_duration}. Run time: ${finished.duration}.`);
    console.log(`Counts: ${JSON.stringify(finished.counts)}`);
    await reportStorageSizes(client);
    return finished;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const { error: abortError } = await client.rpc('abort_import_run', { run_id: run.id, reason });
    if (abortError && !/not open/.test(abortError.message)) {
      console.error(`Could not abort import run ${run.id}: ${abortError.message}`);
    }
    throw error;
  }
}

async function stageRows(
  client: ImportClient,
  runId: string,
  rows: AsyncIterable<StagedRow>,
  limits: BatchLimits,
): Promise<Record<string, number>> {
  const targets = new Map<string, TargetProgress>();

  const send = async (target: string, progress: TargetProgress) => {
    const batchNumber = progress.batches + 1;
    const batchRows = progress.pendingRows;
    progress.pendingRows = [];
    progress.pendingBytes = 0;
    const startedAt = performance.now();
    await withRetries(() =>
      rpcResult<number>(`Stage ${target} batch ${batchNumber}`, () =>
        client.rpc('stage_import_batch', {
          run_id: runId,
          target,
          batch_number: batchNumber,
          batch_rows: batchRows,
        }),
      ),
    );
    const elapsedMs = performance.now() - startedAt;
    progress.batches = batchNumber;
    progress.stagedRows += batchRows.length;
    progress.totalMs += elapsedMs;
    progress.maxMs = Math.max(progress.maxMs, elapsedMs);
  };

  for await (const { target, row } of rows) {
    const progress = targets.get(target) ?? {
      pendingRows: [],
      pendingBytes: 0,
      batches: 0,
      stagedRows: 0,
      totalMs: 0,
      maxMs: 0,
    };
    targets.set(target, progress);
    progress.pendingRows.push(row);
    progress.pendingBytes += Buffer.byteLength(JSON.stringify(row));
    if (progress.pendingRows.length >= limits.rows || progress.pendingBytes >= limits.bytes) {
      await send(target, progress);
    }
  }

  const stagedRows: Record<string, number> = {};
  for (const [target, progress] of targets) {
    if (progress.pendingRows.length > 0) {
      await send(target, progress);
    }
    stagedRows[target] = progress.stagedRows;
    console.log(
      `Staged ${target}: ${progress.stagedRows} rows in ${progress.batches} batches, mean ${Math.round(progress.totalMs / progress.batches)} ms, max ${Math.round(progress.maxMs)} ms per batch.`,
    );
  }
  return stagedRows;
}

async function reportStorageSizes(client: ImportClient): Promise<void> {
  const sizes = await rpcResult<{ relation: string; total_bytes: number }[]>('Storage sizes', () =>
    client.rpc('catalog_storage_sizes'),
  );
  for (const { relation, total_bytes } of sizes) {
    console.log(`Size of ${relation}: ${formatBytes(total_bytes)}.`);
  }
}
