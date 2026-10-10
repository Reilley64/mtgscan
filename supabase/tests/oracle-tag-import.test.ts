import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  type FixtureChanges,
  type ScryfallOracleTag,
  catalogFixture,
  catalogFixtureManifest,
  latestRun,
  oracleIdOf,
  oracleTagFixtureSnapshotAt,
  oracleTagOf,
  resetCardCatalog,
  runCatalogImport,
  runOracleTagCommand,
  runOracleTagImport,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const invalidParameterValue = '22023';
const laterSnapshotAt = '2026-10-16T21:00:00.000+00:00';
const importKeyClient = secretKeyClient();

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function expectImported(manifest: string, ...flags: string[]) {
  const result = await runOracleTagImport(manifest, ...flags);
  expect(result.output).not.toContain('error');
  expect(result.exitCode).toBe(0);
  return result;
}

async function rowCount(table: 'oracle_tags' | 'tag_edges' | 'card_taggings') {
  const { count, error } = await alice.client.from(table).select('*', { count: 'exact', head: true });
  expect(error).toBeNull();
  return count;
}

async function oracleTag(slug: string) {
  const { data, error } = await alice.client.from('oracle_tags').select('*').eq('slug', slug).maybeSingle();
  expect(error).toBeNull();
  return data;
}

async function taggedCards(slug: string) {
  const tag = await oracleTagOf(slug);
  const { data, error } = await alice.client.from('card_taggings').select('oracle_id').eq('tag_id', tag.id);
  expect(error).toBeNull();
  return data!.map((row) => row.oracle_id).sort();
}

async function parentIds(tagId: string) {
  const { data, error } = await alice.client.from('tag_edges').select('parent_id').eq('child_id', tagId);
  expect(error).toBeNull();
  return data!.map((row) => row.parent_id);
}

async function tagFreshness() {
  const { data, error } = await alice.client.rpc('catalog_freshness');
  expect(error).toBeNull();
  return data!.find((row) => row.source === 'oracle_tags')!;
}

async function disabledTagIds() {
  const { data, error } = await alice.client.from('disabled_tags').select('tag_id');
  expect(error).toBeNull();
  return data!.map((row) => row.tag_id);
}

function sameTime(actual: string | null, expected: string) {
  expect(actual && new Date(actual).toISOString()).toBe(new Date(expected).toISOString());
}

function editTags(edit: (tag: ScryfallOracleTag) => ScryfallOracleTag | null) {
  return (records: ScryfallOracleTag[]) => records.flatMap((tag) => edit(tag) ?? []);
}

beforeEach(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

describe('after one Oracle tag import', () => {
  beforeEach(async () => {
    await expectImported(catalogFixtureManifest);
  });

  test('every tag, tag edge, and card tagging for a known card is in the card catalog', async () => {
    expect(await rowCount('oracle_tags')).toBe(656);
    expect(await rowCount('tag_edges')).toBe(536);
    expect(await rowCount('card_taggings')).toBe(1178);
  });

  test('a tag keeps its UUID, slug, label, description, and aliases', async () => {
    expect(await oracleTag('sweeper')).toMatchObject({
      id: (await oracleTagOf('sweeper')).id,
      slug: 'sweeper',
      label: 'sweeper',
      description: expect.stringContaining('Destroy all the things!'),
      aliases: ['wipe', 'boardwipe', 'wrath of god', 'mass removal'],
    });
  });

  test('taggings that name a card outside the card catalog are dropped and counted', async () => {
    const { data } = await alice.client
      .from('card_taggings')
      .select('oracle_id')
      .eq('oracle_id', await oracleIdOf('Mine Security'));

    expect(data).toEqual([]);
    expect((await latestRun('oracle_tags')).counts).toMatchObject({
      oracle_tags: { staged: 656, inserted: 656 },
      tag_edges: { staged: 536, accepted: 536, dropped: 0, inserted: 536 },
      card_taggings: { staged: 1187, accepted: 1178, dropped: 9, inserted: 1178 },
    });
  });

  test('data is as of the Oracle tag file time and fresh', async () => {
    const freshness = await tagFreshness();

    sameTime(freshness.snapshot_at, oracleTagFixtureSnapshotAt);
    expect(freshness.is_stale).toBe(false);
  });

  test('Oracle tags turn stale 7 days after their last successful import', async () => {
    const ageSnapshot = async (days: number) => {
      const { error } = await importKeyClient
        .from('import_snapshots')
        .update({ succeeded_at: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() })
        .eq('source', 'oracle_tags');
      expect(error).toBeNull();
    };

    await ageSnapshot(6.9);
    expect((await tagFreshness()).is_stale).toBe(false);
    await ageSnapshot(7.1);
    expect((await tagFreshness()).is_stale).toBe(true);
  });
});

describe('Oracle tag import runs', () => {
  test('a later run adds, updates, and removes tags, tag edges, and card taggings', async () => {
    await expectImported(catalogFixtureManifest);
    const removalBurn = await oracleTagOf('removal-burn');
    const burnCreature = await oracleTagOf('burn-creature');
    const shock = await oracleIdOf('Shock');

    await expectImported(
      await catalogFixture({
        updatedAt: laterSnapshotAt,
        oracleTags: editTags((tag) => {
          if (tag.slug === 'fog') {
            return null;
          }
          if (tag.slug === 'burn-creature') {
            return { ...tag, parent_ids: tag.parent_ids.filter((id) => id !== removalBurn.id) };
          }
          if (tag.slug === 'sweeper') {
            return { ...tag, label: 'board wipe' };
          }
          if (tag.slug === 'ramp') {
            return { ...tag, taggings: [...tag.taggings, { oracle_id: shock, weight: 'median' }] };
          }
          return tag;
        }),
      }),
    );

    expect(await oracleTag('fog')).toBeNull();
    expect(await parentIds(burnCreature.id)).not.toContain(removalBurn.id);
    expect((await oracleTag('sweeper'))!.label).toBe('board wipe');
    expect(await taggedCards('ramp')).toContain(shock);
    expect((await latestRun('oracle_tags')).counts).toMatchObject({
      oracle_tags: { inserted: 0, updated: 1, deleted: 1 },
      tag_edges: { inserted: 0, deleted: 2 },
      card_taggings: { inserted: 1, deleted: 1 },
    });
    sameTime((await tagFreshness()).snapshot_at, laterSnapshotAt);
  });

  test.each([
    ['a corrupt file', { oracleTagsFile: () => new TextEncoder().encode('not a gzip file') }, [], 'Could not read the Scryfall oracle_tags file'],
    [
      'a file that ends partway',
      { oracleTagsFile: (bytes: Uint8Array) => bytes.slice(0, bytes.length / 2) },
      ['--batch-rows', '50'],
      'Could not read the Scryfall oracle_tags file',
    ],
    [
      'a missing required field',
      { oracleTags: editTags((tag) => (tag.slug === 'ramp' ? { ...tag, label: undefined } : tag)) },
      [],
      'oracle_tags: required fields are missing in 1 staged rows',
    ],
    [
      'a shrink of more than 5%',
      { oracleTags: (records: ScryfallOracleTag[]) => records.map((tag, index) => (index % 10 === 0 ? { ...tag, taggings: [] } : tag)) },
      [],
      'card_taggings: would shrink by more than 5%',
    ],
  ] satisfies [string, FixtureChanges, string[], string][])(
    '%s fails the run and keeps the last good snapshot',
    async (_, changes, flags, reason) => {
      await expectImported(catalogFixtureManifest);

      const result = await runOracleTagImport(await catalogFixture({ ...changes, updatedAt: laterSnapshotAt }), ...flags);

      expect(result.exitCode).toBe(1);
      const run = await latestRun('oracle_tags');
      expect(run.status).toBe('failed');
      expect(run.failure_reason).toContain(reason);
      sameTime((await tagFreshness()).snapshot_at, oracleTagFixtureSnapshotAt);
      expect(await rowCount('oracle_tags')).toBe(656);
      expect(await rowCount('card_taggings')).toBe(1178);
    },
  );

  test('the owner can accept a shrink of more than 5%', async () => {
    await expectImported(catalogFixtureManifest);

    await expectImported(
      await catalogFixture({
        updatedAt: laterSnapshotAt,
        oracleTags: (records) => records.map((tag, index) => (index % 10 === 0 ? { ...tag, taggings: [] } : tag)),
      }),
      '--accept-shrink',
    );

    expect((await latestRun('oracle_tags')).status).toBe('succeeded');
  });

  test('an unchanged source file records a skipped run and changes nothing', async () => {
    await expectImported(catalogFixtureManifest);

    const result = await expectImported(await catalogFixture({ oracleTags: (records) => records.slice(0, 10) }));

    expect(result.output).toContain('Skipped');
    expect((await latestRun('oracle_tags')).status).toBe('skipped');
    expect(await rowCount('oracle_tags')).toBe(656);
  });

  test('a tag import before any catalog import drops every tagging', async () => {
    await resetCardCatalog();

    await expectImported(catalogFixtureManifest);

    expect(await rowCount('oracle_tags')).toBe(656);
    expect(await rowCount('card_taggings')).toBe(0);
  });

  test("a tag import leaves the user's profile unchanged", async () => {
    const before = await alice.client.from('profiles').select('*');

    await expectImported(catalogFixtureManifest);

    expect(await alice.client.from('profiles').select('*')).toEqual(before);
  });

  test('the stage function refuses a catalog target in a tag run', async () => {
    const { data: run } = await importKeyClient.rpc('begin_import_run', {
      source: 'oracle_tags',
      source_updated_at: laterSnapshotAt,
    });

    const { error } = await importKeyClient.rpc('stage_import_batch', {
      run_id: run!.id,
      target: 'cards',
      batch_number: 1,
      batch_rows: [],
    });

    expect(error?.code).toBe(invalidParameterValue);
    await importKeyClient.rpc('abort_import_run', { run_id: run!.id, reason: 'test cleanup' });
  });
});

describe('disabled tags', () => {
  beforeEach(async () => {
    await expectImported(catalogFixtureManifest);
  });

  test('the owner disables a tag by UUID and it stays disabled after a tag import', async () => {
    const sweeper = await oracleTagOf('sweeper');

    const disabled = await runOracleTagCommand('disable', sweeper.id);
    await expectImported(
      await catalogFixture({
        updatedAt: laterSnapshotAt,
        oracleTags: editTags((tag) => (tag.slug === 'sweeper' ? { ...tag, slug: 'board-wipe', label: 'board wipe' } : tag)),
      }),
    );

    expect(disabled).toMatchObject({ exitCode: 0, output: expect.stringContaining('Disabled the Oracle tag sweeper') });
    expect(await disabledTagIds()).toEqual([sweeper.id]);
    expect((await oracleTag('board-wipe'))!.id).toBe(sweeper.id);
  });

  test('the owner enables a disabled tag again', async () => {
    const sweeper = await oracleTagOf('sweeper');
    await runOracleTagCommand('disable', sweeper.id);

    const enabled = await runOracleTagCommand('enable', sweeper.id);

    expect(enabled).toMatchObject({ exitCode: 0, output: expect.stringContaining('Enabled the Oracle tag sweeper') });
    expect(await disabledTagIds()).toEqual([]);
  });

  test('disabling an unknown tag fails and changes nothing', async () => {
    const result = await runOracleTagCommand('disable', crypto.randomUUID());

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('No Oracle tag has the ID');
    expect(await disabledTagIds()).toEqual([]);
  });

  test('enabling a tag that is not disabled fails', async () => {
    const result = await runOracleTagCommand('enable', (await oracleTagOf('sweeper')).id);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is not disabled');
  });

  test('the command refuses a value that is not a UUID', async () => {
    const result = await runOracleTagCommand('disable', 'sweeper');

    expect(result.exitCode).toBe(2);
    expect(await disabledTagIds()).toEqual([]);
  });

  test.each(['disable_oracle_tag', 'enable_oracle_tag'] as const)(
    '%s refuses a signed-in user and the publishable key',
    async (name) => {
      const tagId = (await oracleTagOf('sweeper')).id;

      const { error: userError } = await alice.client.rpc(name, { tag_id: tagId });
      const { error: anonymousError } = await anonymousClient().rpc(name, { tag_id: tagId });

      expect(userError?.code).toBe(permissionDenied);
      expect(anonymousError?.code).toBe(permissionDenied);
      expect(await disabledTagIds()).toEqual([]);
    },
  );

  test('a signed-in user cannot write disabled tags directly', async () => {
    const { error } = await alice.client.from('disabled_tags').insert({ tag_id: (await oracleTagOf('sweeper')).id });

    expect(error?.code).toBe(permissionDenied);
  });
});
