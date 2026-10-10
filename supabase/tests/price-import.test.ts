import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  type FixtureChanges,
  type ScryfallRecord,
  catalogFixture,
  catalogFixtureManifest,
  latestRun,
  resetCardCatalog,
  runCatalogImport,
  runImportCommand,
  runPriceImport,
} from './catalog-import-command';
import { asDatabaseOwner, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const invalidParameterValue = '22023';
const objectInUse = '55006';
const laterSnapshotAt = '2026-10-15T21:00:00.000+00:00';
const evenLaterSnapshotAt = '2026-10-16T21:00:00.000+00:00';
const importKeyClient = secretKeyClient();

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function expectSuccess(result: Promise<{ exitCode: number; output: string }>) {
  const { exitCode, output } = await result;
  expect(output).not.toContain('error');
  expect(exitCode).toBe(0);
  return output;
}

async function printingId(set: string, collectorNumber: string) {
  const { data, error } = await alice.client
    .from('card_printings')
    .select('id')
    .eq('set_code', set)
    .eq('collector_number', collectorNumber)
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function prices(set: string, collectorNumber: string) {
  const { data, error } = await alice.client
    .from('card_prices')
    .select('usd_nonfoil_cents, usd_foil_cents, usd_etched_cents, eur_nonfoil_cents, eur_foil_cents')
    .eq('printing_id', await printingId(set, collectorNumber))
    .maybeSingle();
  expect(error).toBeNull();
  return data;
}

async function lowestPrices(name: string) {
  const { data: card } = await alice.client.from('cards').select('oracle_id').eq('name', name).single();
  const { data, error } = await alice.client
    .from('card_lowest_prices')
    .select('currency, amount_cents, finish')
    .eq('oracle_id', card!.oracle_id)
    .order('currency');
  expect(error).toBeNull();
  return data!;
}

async function priceFreshness() {
  const { data, error } = await alice.client.rpc('catalog_freshness');
  expect(error).toBeNull();
  return data!.find((row) => row.source === 'prices')!;
}

function changePrinting(
  set: string,
  collectorNumber: string,
  change: (record: ScryfallRecord) => ScryfallRecord | null,
): (records: ScryfallRecord[]) => ScryfallRecord[] {
  return (records) =>
    records.flatMap((record): ScryfallRecord[] => {
      if (record.set !== set || record.collector_number !== collectorNumber) {
        return [record];
      }
      const changed = change(record);
      return changed ? [changed] : [];
    });
}

function withPrices(prices: Record<string, string | null>) {
  return (record: ScryfallRecord) => ({ ...record, prices: { ...(record.prices as object), ...prices } });
}

const noPrices = { usd: null, usd_foil: null, usd_etched: null, eur: null, eur_foil: null, tix: null };

async function importCatalogAndPrices() {
  await resetCardCatalog();
  await expectSuccess(runCatalogImport(catalogFixtureManifest));
  await expectSuccess(runPriceImport(catalogFixtureManifest));
}

describe('after one price import', () => {
  let importStartedAt: number;
  let importEndedAt: number;

  beforeAll(async () => {
    await resetCardCatalog();
    await expectSuccess(runCatalogImport(catalogFixtureManifest));
    importStartedAt = Date.now();
    await expectSuccess(runPriceImport(catalogFixtureManifest));
    importEndedAt = Date.now();
  });

  test('a card printing keeps its USD and EUR prices per finish in integer cents', async () => {
    expect(await prices('rav', '101')).toEqual({
      usd_nonfoil_cents: 15,
      usd_foil_cents: 41,
      usd_etched_cents: null,
      eur_nonfoil_cents: 12,
      eur_foil_cents: 34,
    });
  });

  test('an etched card printing keeps its USD etched price', async () => {
    expect(await prices('cmm', '473')).toEqual({
      usd_nonfoil_cents: null,
      usd_foil_cents: null,
      usd_etched_cents: 7272,
      eur_nonfoil_cents: null,
      eur_foil_cents: null,
    });
  });

  test('a missing price stays missing and is never copied from another finish or printing', async () => {
    expect(await prices('sld', '1556')).toEqual({
      usd_nonfoil_cents: 441,
      usd_foil_cents: null,
      usd_etched_cents: null,
      eur_nonfoil_cents: null,
      eur_foil_cents: null,
    });
  });

  test('a card printing with no price has no current prices', async () => {
    expect(await prices('sld', '1336b')).toBeNull();
  });

  test('each card keeps its lowest current price per currency over printings and finishes', async () => {
    expect(await lowestPrices('Hidetsugu and Kairi')).toEqual([
      { currency: 'USD', amount_cents: 35, finish: 'foil' },
      { currency: 'EUR', amount_cents: 15, finish: 'nonfoil' },
    ]);
    expect(await lowestPrices('Brisela, Voice of Nightmares')).toEqual([]);
  });

  test('prices are as of the time mtgscan received the file, and fresh', async () => {
    const freshness = await priceFreshness();
    const observedAt = new Date(freshness.snapshot_at!).getTime();

    expect(observedAt).toBeGreaterThanOrEqual(importStartedAt - 5_000);
    expect(observedAt).toBeLessThanOrEqual(importEndedAt + 5_000);
    expect(freshness.is_stale).toBe(false);
    expect(freshness.last_attempt_status).toBe('succeeded');
  });
});

describe('price import runs', () => {
  beforeEach(importCatalogAndPrices);

  test('a later run updates changed prices, removes prices that left the file, and recomputes the lowest price', async () => {
    await expectSuccess(
      runPriceImport(
        await catalogFixture({
          updatedAt: laterSnapshotAt,
          defaultCards: (records) =>
            [
              changePrinting('rav', '101', withPrices({ usd: '0.20' })),
              changePrinting('prna', '22p', withPrices({ usd: null })),
              changePrinting('cmm', '473', withPrices(noPrices)),
            ].reduce((changed, change) => change(changed), records),
        }),
      ),
    );

    expect((await prices('rav', '101'))!.usd_nonfoil_cents).toBe(20);
    expect(await prices('cmm', '473')).toBeNull();
    expect(await lowestPrices('Smothering Tithe')).toEqual([
      { currency: 'USD', amount_cents: 5859, finish: 'foil' },
      { currency: 'EUR', amount_cents: 3419, finish: 'nonfoil' },
    ]);
    expect((await latestRun('prices')).counts).toMatchObject({
      card_prices: { inserted: 0, updated: 2, deleted: 1, dropped: 0 },
      card_lowest_prices: { inserted: 0, updated: 1, deleted: 0 },
    });
  });

  test('an etched price can be the lowest current price, labelled etched', async () => {
    await expectSuccess(
      runPriceImport(
        await catalogFixture({
          updatedAt: laterSnapshotAt,
          defaultCards: changePrinting('cmm', '543', withPrices({ usd_etched: '1.99' })),
        }),
      ),
    );

    expect(await lowestPrices('Krenko, Mob Boss')).toContainEqual({
      currency: 'USD',
      amount_cents: 199,
      finish: 'etched',
    });
  });

  test('a EUR etched price is never stored', async () => {
    await expectSuccess(
      runPriceImport(
        await catalogFixture({
          updatedAt: laterSnapshotAt,
          defaultCards: changePrinting('cmm', '473', withPrices({ eur_etched: '0.01' })),
        }),
      ),
    );

    expect(await lowestPrices('Smothering Tithe')).toContainEqual({
      currency: 'EUR',
      amount_cents: 3419,
      finish: 'nonfoil',
    });
  });

  test('a card printing marked absent no longer counts toward the lowest price', async () => {
    await expectSuccess(
      runCatalogImport(
        await catalogFixture({ updatedAt: laterSnapshotAt, defaultCards: changePrinting('mom', '228', () => null) }),
      ),
    );
    await expectSuccess(runPriceImport(await catalogFixture({ updatedAt: laterSnapshotAt })));

    expect(await lowestPrices('Hidetsugu and Kairi')).toEqual([
      { currency: 'USD', amount_cents: 37, finish: 'nonfoil' },
      { currency: 'EUR', amount_cents: 20, finish: 'nonfoil' },
    ]);
  });

  test('a price for a card printing outside the card catalog is dropped and counted', async () => {
    await expectSuccess(
      runPriceImport(
        await catalogFixture({
          updatedAt: laterSnapshotAt,
          defaultCards: (records) => [
            ...records,
            { ...records.find((record) => record.set === 'rav')!, id: crypto.randomUUID(), collector_number: '999' },
          ],
        }),
      ),
    );

    expect((await latestRun('prices')).counts).toMatchObject({ card_prices: { dropped: 1, inserted: 0 } });
  });

  test.each([
    [
      'a corrupt file',
      { defaultCardsFile: () => new TextEncoder().encode('not a gzip file') },
      [],
      'Could not read the Scryfall default_cards file',
    ],
    [
      'a price that is not a decimal amount',
      { defaultCards: changePrinting('rav', '101', withPrices({ usd: 'free' })) },
      [],
      'has a usd price that is not a decimal amount',
    ],
    [
      'a missing card printing ID',
      { defaultCards: changePrinting('rav', '101', (record) => ({ ...record, id: undefined })) },
      [],
      'card_prices: required fields are missing in 1 staged rows',
    ],
    [
      'a shrink of more than 5%',
      { defaultCards: (records: ScryfallRecord[]) => records.filter((_, index) => index % 10 !== 0) },
      [],
      'card_prices: would shrink by more than 5%',
    ],
    [
      'a file that ends partway',
      { defaultCardsFile: (bytes: Uint8Array) => bytes.slice(0, bytes.length / 2) },
      ['--batch-rows', '20'],
      'Could not read the Scryfall default_cards file',
    ],
  ] satisfies [string, FixtureChanges, string[], string][])(
    '%s fails the run and keeps the last good prices',
    async (_, changes, flags, reason) => {
      const before = await priceFreshness();

      const result = await runPriceImport(await catalogFixture({ ...changes, updatedAt: laterSnapshotAt }), ...flags);

      expect(result.exitCode).toBe(1);
      const run = await latestRun('prices');
      expect(run.status).toBe('failed');
      expect(run.failure_reason).toContain(reason);
      expect((await priceFreshness()).snapshot_at).toBe(before.snapshot_at);
      expect((await prices('rav', '101'))!.usd_nonfoil_cents).toBe(15);
      expect(await lowestPrices('Hidetsugu and Kairi')).toHaveLength(2);
    },
  );

  test('the owner can accept a price shrink of more than 5%', async () => {
    await expectSuccess(
      runPriceImport(
        await catalogFixture({
          updatedAt: laterSnapshotAt,
          defaultCards: (records) => records.filter((_, index) => index % 10 !== 0),
        }),
        '--accept-shrink',
      ),
    );

    expect((await latestRun('prices')).status).toBe('succeeded');
  });

  test('an unchanged Default Cards file records a skipped run and changes nothing', async () => {
    const before = await priceFreshness();

    const output = await expectSuccess(
      runPriceImport(await catalogFixture({ defaultCards: changePrinting('rav', '101', withPrices({ usd: '9.99' })) })),
    );

    expect(output).toContain('Skipped');
    expect((await latestRun('prices')).status).toBe('skipped');
    expect((await prices('rav', '101'))!.usd_nonfoil_cents).toBe(15);
    expect(await priceFreshness()).toMatchObject({
      snapshot_at: before.snapshot_at,
      succeeded_at: before.succeeded_at,
    });
  });

  test('only one price run can be open at a time', async () => {
    const { data: openRun } = await importKeyClient.rpc('begin_import_run', {
      source: 'prices',
      source_updated_at: laterSnapshotAt,
    });

    const result = await runPriceImport(await catalogFixture({ updatedAt: evenLaterSnapshotAt }));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('A prices import run is already open');
    const { error } = await importKeyClient.rpc('begin_import_run', {
      source: 'prices',
      source_updated_at: evenLaterSnapshotAt,
    });
    expect(error?.code).toBe(objectInUse);
    await importKeyClient.rpc('abort_import_run', { run_id: openRun!.id, reason: 'test cleanup' });
  });

  test('the stage function refuses a card catalog target in a price run', async () => {
    const { data: run } = await importKeyClient.rpc('begin_import_run', {
      source: 'prices',
      source_updated_at: laterSnapshotAt,
    });

    const { error } = await importKeyClient.rpc('stage_import_batch', {
      run_id: run!.id,
      target: 'card_printings',
      batch_number: 1,
      batch_rows: [],
    });

    expect(error?.code).toBe(invalidParameterValue);
    await importKeyClient.rpc('abort_import_run', { run_id: run!.id, reason: 'test cleanup' });
  });

  test("a price run leaves the card catalog and the user's profile unchanged", async () => {
    const before = await Promise.all([
      alice.client.from('profiles').select('*'),
      alice.client.from('cards').select('*', { count: 'exact', head: true }),
      latestRun('catalog'),
    ]);

    await expectSuccess(runPriceImport(await catalogFixture({ updatedAt: laterSnapshotAt })));

    expect(
      await Promise.all([
        alice.client.from('profiles').select('*'),
        alice.client.from('cards').select('*', { count: 'exact', head: true }),
        latestRun('catalog'),
      ]),
    ).toEqual(before);
  });
});

describe('price freshness', () => {
  beforeEach(importCatalogAndPrices);

  async function agePriceSnapshot(hours: number) {
    const { error } = await importKeyClient
      .from('import_snapshots')
      .update({ succeeded_at: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() })
      .eq('source', 'prices');
    expect(error).toBeNull();
  }

  test('prices turn stale 24 hours after their last successful import', async () => {
    await agePriceSnapshot(23.9);
    expect((await priceFreshness()).is_stale).toBe(false);
    await agePriceSnapshot(24.1);
    expect((await priceFreshness()).is_stale).toBe(true);
  });
});

describe('daily maintenance', () => {
  beforeEach(importCatalogAndPrices);

  test('a weekly source whose latest run failed is retried', async () => {
    await runCatalogImport(
      await catalogFixture({ updatedAt: laterSnapshotAt, defaultCardsFile: () => new Uint8Array([1, 2, 3]) }),
    );
    expect((await latestRun('catalog')).status).toBe('failed');

    const output = await expectSuccess(
      runImportCommand('retry-weekly', '--manifest', await catalogFixture({ updatedAt: laterSnapshotAt })),
    );

    expect(output).toContain('Retrying the catalog import');
    expect((await latestRun('catalog')).status).toBe('succeeded');
  });

  test('a failed retry fails the command and records the failure', async () => {
    await runCatalogImport(
      await catalogFixture({ updatedAt: laterSnapshotAt, defaultCardsFile: () => new Uint8Array([1, 2, 3]) }),
    );
    const { id: failedRunId } = await latestRun('catalog');

    const result = await runImportCommand(
      'retry-weekly',
      '--manifest',
      await catalogFixture({ updatedAt: laterSnapshotAt, defaultCardsFile: () => new Uint8Array([1, 2, 3]) }),
    );

    expect(result.exitCode).toBe(1);
    const retried = await latestRun('catalog');
    expect(retried.id).not.toBe(failedRunId);
    expect(retried.status).toBe('failed');
  });

  test('no weekly source is retried when none failed', async () => {
    const before = await latestRun('catalog');

    const output = await expectSuccess(runImportCommand('retry-weekly', '--manifest', catalogFixtureManifest));

    expect(output).toContain('No weekly source needs a retry.');
    expect(await latestRun('catalog')).toEqual(before);
  });

  test('pruning deletes search telemetry older than 180 days and keeps newer rows', async () => {
    const searchIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const { data, error } = await alice.client.rpc('search_catalog', { query: { text: 'fog' } });
      expect(error).toBeNull();
      searchIds.push((data as { search_id: string }).search_id);
    }
    const [oldSearch, recentSearch] = searchIds;
    await asDatabaseOwner(async (database) => {
      await database`update public.search_telemetry set created_at = now() - interval '181 days' where search_id = ${oldSearch}`;
      await database`update public.search_telemetry set created_at = now() - interval '179 days' where search_id = ${recentSearch}`;
    });

    const output = await expectSuccess(runImportCommand('prune-telemetry'));

    expect(output).toMatch(/Deleted [1-9]\d* search telemetry rows older than 180 days/);
    const { data } = await importKeyClient.from('search_telemetry').select('search_id').in('search_id', searchIds);
    expect(data).toEqual([{ search_id: recentSearch! }]);
  });
});
