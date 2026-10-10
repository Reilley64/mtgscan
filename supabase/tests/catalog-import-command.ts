import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from '../database.types';
import { readGzipJsonLines } from '../import/gzip-json-lines';
import { localSecretKey, localStackUrl, secretKeyClient } from './local-stack';

const supabaseDirectory = join(import.meta.dir, '..');
const fixtureDirectory = join(import.meta.dir, 'fixtures', 'scryfall');

export const catalogFixtureManifest = join(fixtureDirectory, 'bulk-data.json');
export const catalogFixtureSnapshotAt = '2026-10-08T21:01:56.786+00:00';
export const oracleTagFixtureSnapshotAt = '2026-10-09T21:00:33.548+00:00';

export type ScryfallRecord = {
  name?: string;
  oracle_id?: string;
  card_faces?: { oracle_id?: string }[];
  [field: string]: unknown;
};

export type ScryfallOracleTag = {
  id: string;
  slug: string;
  label?: string;
  parent_ids: string[];
  child_ids: string[];
  taggings: { oracle_id: string; weight: string }[];
  [field: string]: unknown;
};

export type FixtureChanges = {
  updatedAt?: string;
  oracleCards?: (records: ScryfallRecord[]) => ScryfallRecord[];
  defaultCards?: (records: ScryfallRecord[]) => ScryfallRecord[];
  defaultCardsFile?: (bytes: Uint8Array) => Uint8Array;
  oracleTags?: (records: ScryfallOracleTag[]) => ScryfallOracleTag[];
  oracleTagsFile?: (bytes: Uint8Array) => Uint8Array;
};

async function readRecords<Item = ScryfallRecord>(file: string): Promise<Item[]> {
  const records: Item[] = [];
  for await (const record of readGzipJsonLines(Bun.file(join(fixtureDirectory, file)).stream())) {
    records.push(record as Item);
  }
  return records;
}

function gzipRecords(records: object[]): Uint8Array {
  return Bun.gzipSync(new TextEncoder().encode(records.map((record) => JSON.stringify(record)).join('\n')));
}

export function printingOracleId(record: ScryfallRecord): string | undefined {
  return record.oracle_id ?? record.card_faces?.[0]?.oracle_id;
}

export async function oracleTagOf(slug: string): Promise<ScryfallOracleTag> {
  const tag = (await readRecords<ScryfallOracleTag>('oracle-tags.jsonl.gz')).find((record) => record.slug === slug);
  if (!tag) {
    throw new Error(`${slug} is not in the Oracle tag fixture`);
  }
  return tag;
}

export async function oracleIdOf(name: string): Promise<string> {
  const record = (await readRecords('oracle-cards.jsonl.gz')).find((card) => card.name === name);
  if (!record?.oracle_id) {
    throw new Error(`${name} is not in the catalog fixture`);
  }
  return record.oracle_id;
}

export function withoutCards(names: string[]) {
  const keep = (records: ScryfallRecord[]) => records.filter((card) => !names.includes(card.name ?? ''));
  return { oracleCards: keep, defaultCards: keep };
}

export async function catalogFixture(changes: FixtureChanges): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mtgscan-catalog-fixture-'));
  const manifest = await Bun.file(catalogFixtureManifest).json();
  const oracleCards = (changes.oracleCards ?? ((records) => records))(
    await readRecords('oracle-cards.jsonl.gz'),
  );
  const defaultCardsBytes = gzipRecords(
    (changes.defaultCards ?? ((records) => records))(await readRecords('default-cards.jsonl.gz')),
  );
  await Bun.write(join(directory, 'oracle-cards.jsonl.gz'), gzipRecords(oracleCards));
  await Bun.write(
    join(directory, 'default-cards.jsonl.gz'),
    changes.defaultCardsFile ? changes.defaultCardsFile(defaultCardsBytes) : defaultCardsBytes,
  );
  const oracleTagsBytes = gzipRecords(
    (changes.oracleTags ?? ((records) => records))(await readRecords<ScryfallOracleTag>('oracle-tags.jsonl.gz')),
  );
  await Bun.write(
    join(directory, 'oracle-tags.jsonl.gz'),
    changes.oracleTagsFile ? changes.oracleTagsFile(oracleTagsBytes) : oracleTagsBytes,
  );
  for (const file of manifest.data) {
    file.updated_at = changes.updatedAt ?? file.updated_at;
  }
  const manifestPath = join(directory, 'bulk-data.json');
  await Bun.write(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}

export type CommandResult = {
  exitCode: number;
  output: string;
};

async function runScript(script: string, args: string[]): Promise<CommandResult> {
  const command = Bun.spawn(['bun', script, ...args], {
    cwd: supabaseDirectory,
    env: { ...process.env, SUPABASE_URL: localStackUrl, SUPABASE_SECRET_KEY: localSecretKey() },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

export function runImportCommand(...args: string[]): Promise<CommandResult> {
  return runScript('import/main.ts', args);
}

export function runCatalogImport(manifest: string, ...flags: string[]): Promise<CommandResult> {
  return runImportCommand('catalog', '--manifest', manifest, ...flags);
}

export function runPriceImport(manifest: string, ...flags: string[]): Promise<CommandResult> {
  return runImportCommand('prices', '--manifest', manifest, ...flags);
}

export function runOracleTagImport(manifest: string, ...flags: string[]): Promise<CommandResult> {
  return runImportCommand('oracle_tags', '--manifest', manifest, ...flags);
}

export function runOracleTagCommand(action: 'disable' | 'enable', tagId: string): Promise<CommandResult> {
  return runScript('import/oracle-tag.ts', [action, tagId]);
}

export async function resetCardCatalog(): Promise<void> {
  const client = secretKeyClient();
  for (const request of [
    () => client.from('disabled_tags').delete().not('tag_id', 'is', null),
    () => client.from('card_taggings').delete().not('tag_id', 'is', null),
    () => client.from('tag_edges').delete().not('child_id', 'is', null),
    () => client.from('oracle_tags').delete().not('id', 'is', null),
    () => client.from('import_snapshots').delete().not('run_id', 'is', null),
    () => client.from('import_runs').delete().not('id', 'is', null),
    () => client.from('card_lowest_prices').delete().not('oracle_id', 'is', null),
    () => client.from('card_prices').delete().not('printing_id', 'is', null),
    () => client.from('card_printings').delete().not('id', 'is', null),
    () => client.from('card_faces').delete().not('oracle_id', 'is', null),
    () => client.from('cards').delete().not('oracle_id', 'is', null),
  ]) {
    const { error } = await request();
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function latestRun(source: Database['public']['Enums']['import_source']) {
  const { data, error } = await secretKeyClient()
    .from('import_runs')
    .select('*')
    .eq('source', source)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
