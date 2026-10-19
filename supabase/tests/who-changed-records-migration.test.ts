import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { createUserTag, setCopyUserTag } from '../collection';
import { connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { oneBuylistCard } from './buylist-card-seeds';
import { catalogFixtureManifest, oracleIdOf, runCatalogImport } from './catalog-import-command';
import { replyOf } from './database-calls';
import { applyPendingMigrations, asDatabaseOwner, supabaseCli } from './local-stack';
import { counterspell, krenkoDeck, onePlannedSwap, scannedCopy } from './planned-swap-seeds';

setDefaultTimeout(180_000);

const migrationBeforeWhoChanged = '20261212090000';

const filledTables: { table: string; timeColumn: string | null; filledFrom: 'user' | 'client' }[] = [
  {
    table: 'copies',
    timeColumn: '(select addition.added_at from public.collection_additions addition where addition.id = addition_id)',
    filledFrom: 'user',
  },
  { table: 'collection_additions', timeColumn: 'added_at', filledFrom: 'user' },
  { table: 'decks', timeColumn: 'created_at', filledFrom: 'user' },
  { table: 'deck_cards', timeColumn: 'added_at', filledFrom: 'user' },
  { table: 'deck_basic_lands', timeColumn: null, filledFrom: 'user' },
  { table: 'deck_changes', timeColumn: 'changed_at', filledFrom: 'user' },
  { table: 'user_tags', timeColumn: 'created_at', filledFrom: 'user' },
  { table: 'copy_user_tags', timeColumn: null, filledFrom: 'user' },
  { table: 'planned_swaps', timeColumn: 'created_at', filledFrom: 'client' },
  { table: 'buylist_cards', timeColumn: 'created_at', filledFrom: 'client' },
];

type FilledRow = { created_by: string; updated_by: string; created_at: string; updated_at: string };

function timesOf(table: string, timeColumn: string, userId: string) {
  return asDatabaseOwner(
    (database) => database`
      select ${database.unsafe(`${timeColumn}::text`)} as time
      from ${database.unsafe(`public.${table}`)}
      where user_id = ${userId}
    `,
  ).then((rows) => rows.map((row: { time: string }) => row.time).toSorted());
}

async function filledRows(table: string, userId: string): Promise<FilledRow[]> {
  return [
    ...(await asDatabaseOwner(
      (database) => database`
        select created_by, updated_by, created_at::text as created_at, updated_at::text as updated_at
        from ${database.unsafe(`public.${table}`)}
        where user_id = ${userId}
      `,
    )),
  ];
}

describe('the migration that records who created and last changed each record', () => {
  let client: ClaimedAiClient;
  let timesBefore: Record<string, string[]>;
  let migrationStartedAfter: Date;

  afterAll(applyPendingMigrations);

  beforeAll(async () => {
    const reset = await supabaseCli('db', 'reset', '--local', '--no-seed', '--version', migrationBeforeWhoChanged);
    expect(reset.exitCode).toBe(0);
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);

    client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const userTag = await replyOf(client.user.client, createUserTag, { name: 'Signed' });
    await replyOf(client.user.client, setCopyUserTag, { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: true });
    await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await oneBuylistCard(client, deckId, await oracleIdOf('Black Lotus'));

    timesBefore = {};
    for (const { table, timeColumn } of filledTables) {
      if (timeColumn) {
        timesBefore[table] = await timesOf(table, timeColumn, client.user.userId);
      }
    }
    const [{ now }] = await asDatabaseOwner((database) => database`select clock_timestamp() as now`);
    migrationStartedAfter = now;

    const { exitCode, output } = await applyPendingMigrations();
    expect(output).toContain('20261213090000');
    expect(exitCode).toBe(0);
  });

  test("existing records were created and last changed by the user, and planned swaps and buylist cards by their AI client", async () => {
    for (const { table, filledFrom } of filledTables) {
      const changer = filledFrom === 'client' ? client.clientId : client.user.userId;
      const rows = await filledRows(table, client.user.userId);

      expect({ table, empty: rows.length === 0 }).toEqual({ table, empty: false });
      expect({ table, changers: [...new Set(rows.map((row) => `${row.created_by} ${row.updated_by}`))] }).toEqual({
        table,
        changers: [`${changer} ${changer}`],
      });
    }
  });

  test("existing records' times start from their existing time column, copies' from their addition's added_at, otherwise from the migration time", async () => {
    for (const { table, timeColumn } of filledTables) {
      const rows = await filledRows(table, client.user.userId);

      expect({ table, updatedAt: rows.map((row) => row.updated_at) }).toEqual({ table, updatedAt: rows.map((row) => row.created_at) });
      if (timeColumn) {
        expect({ table, createdAt: rows.map((row) => row.created_at).toSorted() }).toEqual({ table, createdAt: timesBefore[table]! });
      } else {
        for (const row of rows) {
          expect(new Date(row.created_at).getTime()).toBeGreaterThanOrEqual(migrationStartedAfter.getTime());
        }
      }
    }
  });
});
