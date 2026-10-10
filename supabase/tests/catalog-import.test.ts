import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  type FixtureChanges,
  catalogFixture,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  latestRun,
  oracleIdOf,
  resetCardCatalog,
  runCatalogImport,
  withoutCards,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const objectInUse = '55006';
const invalidParameterValue = '22023';
const laterSnapshotAt = '2026-10-15T21:00:00.000+00:00';
const importKeyClient = secretKeyClient();

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function rowCount(client: AppClient, table: 'cards' | 'card_faces' | 'card_printings') {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  expect(error).toBeNull();
  return count;
}

async function card(name: string) {
  const { data, error } = await alice.client.from('cards').select('*').eq('name', name).single();
  expect(error).toBeNull();
  return data!;
}

async function catalogFreshness(client: AppClient = alice.client) {
  const { data, error } = await client.rpc('catalog_freshness');
  expect(error).toBeNull();
  return data!.find((row) => row.source === 'catalog')!;
}

async function expectImported(manifest: string, ...flags: string[]) {
  const result = await runCatalogImport(manifest, ...flags);
  expect(result.output).not.toContain('error');
  expect(result.exitCode).toBe(0);
  return result;
}

function sameTime(actual: string | null, expected: string) {
  expect(actual && new Date(actual).toISOString()).toBe(new Date(expected).toISOString());
}

describe('after one catalog import', () => {
  beforeAll(async () => {
    await resetCardCatalog();
    await expectImported(catalogFixtureManifest);
  });

  test('every paper card, card face, and card printing is in the card catalog', async () => {
    expect(await rowCount(alice.client, 'cards')).toBe(170);
    expect(await rowCount(alice.client, 'card_faces')).toBe(177);
    expect(await rowCount(alice.client, 'card_printings')).toBe(345);
  });

  test('tokens, art series cards, and digital-only cards are left out', async () => {
    const { data } = await alice.client
      .from('cards')
      .select('name')
      .in('name', ['Tyranid', 'Brightglass Gearhulk // Brightglass Gearhulk', 'Mine Security']);

    expect(data).toEqual([]);
  });

  test('a card keeps its faces and joins them in its own fields', async () => {
    const fireIce = await card('Fire // Ice');
    const { data: faces } = await alice.client
      .from('card_faces')
      .select('face_index, name, mana_cost')
      .eq('oracle_id', fireIce.oracle_id)
      .order('face_index');

    expect(fireIce.mana_cost).toBe('{1}{R} // {1}{U}');
    expect(faces).toEqual([
      { face_index: 0, name: 'Fire', mana_cost: '{1}{R}' },
      { face_index: 1, name: 'Ice', mana_cost: '{1}{U}' },
    ]);
  });

  test('Commander legality and Game Changer keep the Scryfall values', async () => {
    expect((await card('Black Lotus')).commander_legality).toBe('banned');
    expect((await card('Sword of Dungeons & Dragons')).commander_legality).toBe('not_legal');
    expect((await card('Fog')).commander_legality).toBe('legal');
    expect((await card("Thassa's Oracle")).is_game_changer).toBe(true);
    expect((await card('Fog')).is_game_changer).toBe(false);
  });

  test.each([
    ['Kenrith, the Returned King', true],
    ['Teferi, Temporal Archmage', true],
    ['Shorikai, Genesis Engine', true],
    ['Inspirit, Flagship Vessel', true],
    ['The Eternity Elevator', false],
    ['Dungeon Delver', false],
    ['Lightning Bolt', false],
  ])('%s can be commander: %p', async (name, expected) => {
    expect((await card(name)).can_be_commander).toBe(expected);
  });

  test('a card keeps the release date of its earliest paper printing', async () => {
    expect((await card('Fog')).released_at).toBe('1993-08-05');
  });

  test('a reversible card printing belongs to the card named on its faces', async () => {
    const { data, error } = await alice.client
      .from('card_printings')
      .select('oracle_id, image_uris')
      .eq('set_code', 'sld')
      .eq('collector_number', '1556')
      .single();

    expect(error).toBeNull();
    expect(data!.oracle_id).toBe(await oracleIdOf("Jinnie Fay, Jetmir's Second"));
    expect(data!.image_uris).toHaveLength(2);
  });
});

test('a reversible card printing whose faces name different cards belongs to its first face', async () => {
  await resetCardCatalog();
  const fogOracleId = await oracleIdOf('Fog');
  await expectImported(
    await catalogFixture({
      defaultCards: (records) =>
        records.map((record) =>
          record.layout === 'reversible_card' && record.collector_number === '1556'
            ? { ...record, card_faces: [record.card_faces![0]!, { ...record.card_faces![1], oracle_id: fogOracleId }] }
            : record,
        ),
    }),
  );

  const { data } = await alice.client
    .from('card_printings')
    .select('oracle_id')
    .eq('set_code', 'sld')
    .eq('collector_number', '1556')
    .single();

  expect(data!.oracle_id).toBe(await oracleIdOf("Jinnie Fay, Jetmir's Second"));
});

describe('catalog import runs', () => {
  beforeEach(resetCardCatalog);

  test('a later run adds new cards, updates changed cards, and marks missing cards absent', async () => {
    await expectImported(await catalogFixture(withoutCards(['Fog Bank'])));
    const shock = await card('Shock');
    await expectImported(
      await catalogFixture({
        updatedAt: laterSnapshotAt,
        oracleCards: (records) =>
          withoutCards(['Shock'])
            .oracleCards(records)
            .map((record) =>
              record.name === 'Counterspell' ? { ...record, oracle_text: 'Counter target spell or ability.' } : record,
            ),
        defaultCards: withoutCards(['Shock']).defaultCards,
      }),
    );

    expect((await card('Fog Bank')).absent_since).toBeNull();
    expect((await card('Counterspell')).oracle_text).toBe('Counter target spell or ability.');
    expect((await card('Shock')).absent_since).not.toBeNull();
    const { data: shockPrintings } = await alice.client
      .from('card_printings')
      .select('absent_since')
      .eq('oracle_id', shock.oracle_id);
    expect(shockPrintings).toHaveLength(3);
    expect(shockPrintings!.every((printing) => printing.absent_since !== null)).toBe(true);
    expect((await latestRun('catalog')).counts).toMatchObject({
      cards: { inserted: 1, updated: 1, marked_absent: 1 },
      card_printings: { marked_absent: 3 },
    });
  });

  test('a card that returns is present again', async () => {
    await expectImported(catalogFixtureManifest);
    await expectImported(await catalogFixture({ ...withoutCards(['Shock']), updatedAt: laterSnapshotAt }));
    await expectImported(await catalogFixture({ updatedAt: '2026-10-22T21:00:00.000+00:00' }));

    expect((await card('Shock')).absent_since).toBeNull();
  });

  test.each([
    [
      'a corrupt file',
      { defaultCardsFile: () => new TextEncoder().encode('not a gzip file') },
      [],
      'Could not read the Scryfall default_cards file',
    ],
    [
      'a file that ends partway',
      { defaultCardsFile: (bytes: Uint8Array) => bytes.slice(0, bytes.length / 2) },
      ['--batch-rows', '20'],
      'Could not read the Scryfall default_cards file',
    ],
    [
      'a missing required field',
      {
        oracleCards: (records) =>
          records.map((record) => (record.name === 'Fog' ? { ...record, name: undefined } : record)),
      },
      [],
      'cards: required fields are missing in 1 staged rows',
    ],
    [
      'a shrink of more than 5%',
      { oracleCards: (records) => records.filter((_, index) => index % 10 !== 0) },
      [],
      'would shrink by more than 5%',
    ],
  ] satisfies [string, FixtureChanges, string[], string][])(
    '%s fails the run and keeps the last good snapshot',
    async (_, changes, flags, reason) => {
    await expectImported(catalogFixtureManifest);

    const result = await runCatalogImport(
      await catalogFixture({ ...changes, updatedAt: laterSnapshotAt }),
      ...flags,
    );

    expect(result.exitCode).toBe(1);
    const run = await latestRun('catalog');
    expect(run.status).toBe('failed');
    expect(run.failure_reason).toContain(reason);
    sameTime((await catalogFreshness()).snapshot_at, catalogFixtureSnapshotAt);
    expect(await rowCount(alice.client, 'cards')).toBe(170);
    expect(await rowCount(alice.client, 'card_printings')).toBe(345);
    expect((await card('Fog')).absent_since).toBeNull();
  });

  test('the owner can accept a shrink of more than 5%', async () => {
    await expectImported(catalogFixtureManifest);

    await expectImported(
      await catalogFixture({
        updatedAt: laterSnapshotAt,
        oracleCards: (records) => records.filter((_, index) => index % 10 !== 0),
      }),
      '--accept-shrink',
    );

    expect((await latestRun('catalog')).status).toBe('succeeded');
    sameTime((await catalogFreshness()).snapshot_at, laterSnapshotAt);
  });

  test('an unchanged source file records a skipped run and changes nothing', async () => {
    await expectImported(catalogFixtureManifest);
    const before = await catalogFreshness();

    const result = await expectImported(
      await catalogFixture({ oracleCards: (records) => records.slice(0, 10) }),
    );

    expect(result.output).toContain('Skipped');
    expect((await latestRun('catalog')).status).toBe('skipped');
    expect(await rowCount(alice.client, 'cards')).toBe(170);
    expect((await catalogFreshness()).succeeded_at).toBe(before.succeeded_at);
  });

  test('only one catalog run can be open at a time', async () => {
    const { data: openRun } = await importKeyClient.rpc('begin_import_run', {
      source: 'catalog',
      source_updated_at: catalogFixtureSnapshotAt,
    });

    const result = await runCatalogImport(catalogFixtureManifest);
    const { error } = await importKeyClient.rpc('begin_import_run', {
      source: 'catalog',
      source_updated_at: catalogFixtureSnapshotAt,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('A catalog import run is already open');
    expect(error?.code).toBe(objectInUse);
    expect(await rowCount(alice.client, 'cards')).toBe(0);
    await importKeyClient.rpc('abort_import_run', { run_id: openRun!.id, reason: 'test cleanup' });
  });

  test('a run left open for more than 2 hours expires when the next run begins', async () => {
    const { data: staleRun } = await importKeyClient.rpc('begin_import_run', {
      source: 'catalog',
      source_updated_at: catalogFixtureSnapshotAt,
    });
    await importKeyClient
      .from('import_runs')
      .update({ started_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() })
      .eq('id', staleRun!.id);

    await expectImported(catalogFixtureManifest);

    const { data } = await importKeyClient.from('import_runs').select('status').eq('id', staleRun!.id).single();
    expect(data!.status).toBe('expired');
    expect(await rowCount(alice.client, 'cards')).toBe(170);
  });

  test("an import run leaves the user's profile unchanged", async () => {
    const before = await alice.client.from('profiles').select('*');

    await expectImported(catalogFixtureManifest);

    expect(await alice.client.from('profiles').select('*')).toEqual(before);
  });
});

describe('catalog freshness', () => {
  beforeEach(resetCardCatalog);

  async function ageCatalogSnapshot(days: number) {
    const { error } = await importKeyClient
      .from('import_snapshots')
      .update({ succeeded_at: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() })
      .eq('source', 'catalog');
    expect(error).toBeNull();
  }

  test('the catalog is stale before its first import', async () => {
    expect(await catalogFreshness()).toMatchObject({ snapshot_at: null, is_stale: true });
  });

  test('data is as of the Scryfall file time and fresh after an import', async () => {
    await expectImported(catalogFixtureManifest);

    const freshness = await catalogFreshness();

    sameTime(freshness.snapshot_at, catalogFixtureSnapshotAt);
    expect(freshness.is_stale).toBe(false);
    expect(freshness.last_attempt_status).toBe('succeeded');
  });

  test('the catalog turns stale 7 days after its last successful import', async () => {
    await expectImported(catalogFixtureManifest);

    await ageCatalogSnapshot(6.9);
    expect((await catalogFreshness()).is_stale).toBe(false);
    await ageCatalogSnapshot(7.1);
    expect((await catalogFreshness()).is_stale).toBe(true);
  });

  test('a failed run shows as the last attempt without moving the snapshot time', async () => {
    await expectImported(catalogFixtureManifest);
    await runCatalogImport(
      await catalogFixture({ updatedAt: laterSnapshotAt, defaultCardsFile: () => new Uint8Array([1, 2, 3]) }),
    );

    const freshness = await catalogFreshness();

    expect(freshness.last_attempt_status).toBe('failed');
    sameTime(freshness.snapshot_at, catalogFixtureSnapshotAt);
  });

  test('an anonymous caller cannot read freshness', async () => {
    const { error } = await anonymousClient().rpc('catalog_freshness');

    expect(error?.code).toBe(permissionDenied);
  });
});

describe('import functions', () => {
  const someRunId = '00000000-0000-4000-8000-000000000000';
  const calls = [
    ['begin_import_run', { source: 'catalog', source_updated_at: laterSnapshotAt }],
    ['stage_import_batch', { run_id: someRunId, target: 'cards', batch_number: 1, batch_rows: [] }],
    ['finish_import_run', { run_id: someRunId, staged_rows: {} }],
    ['abort_import_run', { run_id: someRunId, reason: 'test' }],
    ['catalog_storage_sizes', {}],
    ['prune_search_telemetry', {}],
  ] as const;

  test.each(calls)('%s refuses a signed-in user', async (name, args) => {
    const { error } = await alice.client.rpc(name, args as never);

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(calls)('%s refuses the publishable key', async (name, args) => {
    const { error } = await anonymousClient().rpc(name, args as never);

    expect(error?.code).toBe(permissionDenied);
  });

  test('the stage function refuses a target outside the staging list', async () => {
    await resetCardCatalog();
    const { data: run } = await importKeyClient.rpc('begin_import_run', {
      source: 'catalog',
      source_updated_at: laterSnapshotAt,
    });

    const { error } = await importKeyClient.rpc('stage_import_batch', {
      run_id: run!.id,
      target: 'profiles',
      batch_number: 1,
      batch_rows: [{ user_id: alice.userId }],
    });

    expect(error?.code).toBe(invalidParameterValue);
    await importKeyClient.rpc('abort_import_run', { run_id: run!.id, reason: 'test cleanup' });
  });
});
