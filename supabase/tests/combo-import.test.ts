import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  type SpellbookFixtureChanges,
  type SpellbookVariant,
  catalogFixtureManifest,
  latestRun,
  oracleIdOf,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runImportCommand,
  spellbookFixture,
  spellbookFixtureSnapshotAt,
  spellbookFixtureVariant,
  spellbookFixtureVariants,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const invalidParameterValue = '22023';
const laterSnapshotAt = '2026-10-17T09:00:00.000+00:00';
const kikiJikiCombo = '618-1719';
const thassasOracleCombo = '742-1295';
const importKeyClient = secretKeyClient();

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function expectImported(variants: string, ...flags: string[]) {
  const result = await runComboImport(variants, ...flags);
  expect(result.output).not.toContain('error');
  expect(result.exitCode).toBe(0);
  return result;
}

async function combos() {
  const { data, error } = await alice.client.from('combos').select('*').order('id');
  expect(error).toBeNull();
  return data!;
}

async function comboIds() {
  return (await combos()).map((combo) => combo.id);
}

async function comboFreshness() {
  const { data, error } = await alice.client.rpc('catalog_freshness');
  expect(error).toBeNull();
  return data!.find((row) => row.source === 'commander_spellbook')!;
}

function sameTime(actual: string | null, expected: string) {
  expect(actual && new Date(actual).toISOString()).toBe(new Date(expected).toISOString());
}

function editVariant(id: string, edit: (variant: SpellbookVariant) => SpellbookVariant | null) {
  return (variants: SpellbookVariant[]) =>
    variants.flatMap((variant) => (variant.id === id ? (edit(variant) ?? []) : [variant]));
}

function laterFile(changes: SpellbookFixtureChanges) {
  return spellbookFixture({ timestamp: laterSnapshotAt, ...changes });
}

beforeEach(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

describe('after one combo import', () => {
  beforeEach(async () => {
    await expectImported(spellbookFixtureVariants);
  });

  test('every two-card combo whose cards are both in the card catalog is imported', async () => {
    expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
  });

  test('a combo keeps its Spellbook ID, both Oracle IDs, color identity, produced features, and bracket tag', async () => {
    expect((await combos()).find((combo) => combo.id === thassasOracleCombo)).toEqual({
      id: thassasOracleCombo,
      first_oracle_id: await oracleIdOf('Demonic Consultation'),
      second_oracle_id: await oracleIdOf("Thassa's Oracle"),
      color_identity: ['B', 'U'],
      produced_features: ['Exile your library', 'Win the game'],
      bracket_tag: 'ruthless',
    });
  });

  test('combos that name a card outside the card catalog are dropped and counted', async () => {
    expect((await latestRun('commander_spellbook')).counts).toEqual({
      combos: { staged: 4, accepted: 2, dropped: 2, inserted: 2, updated: 0, deleted: 0 },
    });
  });

  test('data is as of the Spellbook file time and fresh', async () => {
    const freshness = await comboFreshness();

    sameTime(freshness.snapshot_at, spellbookFixtureSnapshotAt);
    expect(freshness.is_stale).toBe(false);
  });

  test('combos turn stale 7 days after their last successful import', async () => {
    const ageSnapshot = async (days: number) => {
      const { error } = await importKeyClient
        .from('import_snapshots')
        .update({ succeeded_at: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() })
        .eq('source', 'commander_spellbook');
      expect(error).toBeNull();
    };

    await ageSnapshot(6.9);
    expect((await comboFreshness()).is_stale).toBe(false);
    await ageSnapshot(7.1);
    expect((await comboFreshness()).is_stale).toBe(true);
  });

  test('a signed-in user reads combos, and an anonymous caller reads none', async () => {
    const { data } = await anonymousClient().from('combos').select('id');

    expect(await comboIds()).toHaveLength(2);
    expect(data ?? []).toEqual([]);
  });

  test('direct writes to combos are refused', async () => {
    const combo = (await combos())[0]!;

    const results = await Promise.all([
      alice.client.from('combos').insert({ ...combo, id: 'new-combo' }),
      alice.client.from('combos').update({ bracket_tag: 'core' }).eq('id', combo.id),
      alice.client.from('combos').delete().eq('id', combo.id),
      anonymousClient().from('combos').delete().eq('id', combo.id),
    ]);

    expect(results.map(({ error }) => error?.code)).toEqual(Array(4).fill(permissionDenied));
    expect(await combos()).toContainEqual(combo);
  });
});

describe('only two-card combos with status OK and no template requirement are imported', () => {
  test.each([
    ['a status other than OK', async (variant: SpellbookVariant) => ({ ...variant, status: 'E' })],
    [
      'a template requirement',
      async (variant: SpellbookVariant) => ({
        ...variant,
        requires: (await spellbookFixtureVariant('618-1430--112')).requires,
      }),
    ],
    [
      'a third card',
      async (variant: SpellbookVariant) => ({
        ...variant,
        uses: [...variant.uses, (await spellbookFixtureVariant('618-3742-3899')).uses[1]!],
      }),
    ],
    [
      'two copies of one card',
      async (variant: SpellbookVariant) => ({
        ...variant,
        uses: [variant.uses[0]!, { ...variant.uses[1]!, quantity: 2 }],
      }),
    ],
  ] satisfies [string, (variant: SpellbookVariant) => Promise<SpellbookVariant>][])(
    'a variant with %s is left out',
    async (_, change) => {
      const changed = await change(await spellbookFixtureVariant(thassasOracleCombo));

      await expectImported(await spellbookFixture({ variants: editVariant(thassasOracleCombo, () => changed) }));

      expect(await comboIds()).toEqual([kikiJikiCombo]);
      expect((await latestRun('commander_spellbook')).counts).toMatchObject({ combos: { staged: 3, accepted: 1 } });
    },
  );

  test('a colorless combo has an empty color identity', async () => {
    await expectImported(
      await spellbookFixture({ variants: editVariant(thassasOracleCombo, (variant) => ({ ...variant, identity: 'C' })) }),
    );

    expect((await combos()).find((combo) => combo.id === thassasOracleCombo)!.color_identity).toEqual([]);
  });
});

describe('combo import runs', () => {
  test('a later run adds new combos and updates changed ones', async () => {
    await expectImported(await spellbookFixture({ variants: editVariant(thassasOracleCombo, () => null) }));

    await expectImported(
      await laterFile({ variants: editVariant(kikiJikiCombo, (variant) => ({ ...variant, bracketTag: 'S' })) }),
    );

    expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
    expect((await combos()).find((combo) => combo.id === kikiJikiCombo)!.bracket_tag).toBe('spicy');
    expect((await latestRun('commander_spellbook')).counts).toMatchObject({
      combos: { inserted: 1, updated: 1, deleted: 0 },
    });
    sameTime((await comboFreshness()).snapshot_at, laterSnapshotAt);
  });

  test('a combo that leaves the Spellbook file is removed when the owner accepts the shrink', async () => {
    await expectImported(spellbookFixtureVariants);

    await expectImported(await laterFile({ variants: editVariant(kikiJikiCombo, () => null) }), '--accept-shrink');

    expect(await comboIds()).toEqual([thassasOracleCombo]);
    expect((await latestRun('commander_spellbook')).counts).toMatchObject({ combos: { deleted: 1 } });
  });

  test.each([
    [
      'a file that ends partway',
      { file: (text: string) => text.slice(0, text.length / 2) },
      ['--batch-rows', '1'],
      'Could not read the Commander Spellbook variants file',
    ],
    [
      'an unknown bracket tag',
      { variants: editVariant(thassasOracleCombo, (variant) => ({ ...variant, bracketTag: 'X' })) },
      [],
      'combos: required fields are missing in 1 staged rows',
    ],
    [
      'a shrink of more than 5%',
      { variants: editVariant(kikiJikiCombo, () => null) },
      [],
      'combos: would shrink by more than 5%',
    ],
  ] satisfies [string, SpellbookFixtureChanges, string[], string][])(
    '%s fails the run and keeps the last good snapshot',
    async (_, changes, flags, reason) => {
      await expectImported(spellbookFixtureVariants);

      const result = await runComboImport(await laterFile(changes), ...flags);

      expect(result.exitCode).toBe(1);
      const run = await latestRun('commander_spellbook');
      expect(run.status).toBe('failed');
      expect(run.failure_reason).toContain(reason);
      sameTime((await comboFreshness()).snapshot_at, spellbookFixtureSnapshotAt);
      expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
    },
  );

  test('a file without a timestamp fails before a run starts and changes nothing', async () => {
    await expectImported(spellbookFixtureVariants);
    const before = await latestRun('commander_spellbook');

    const result = await runComboImport(await laterFile({ file: (text) => text.replace('"timestamp"', '"time"') }));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('it has no timestamp before its variants');
    expect(await latestRun('commander_spellbook')).toEqual(before);
    expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
  });

  test('an unchanged source file records a skipped run and changes nothing', async () => {
    await expectImported(spellbookFixtureVariants);

    const result = await expectImported(await spellbookFixture({ variants: editVariant(kikiJikiCombo, () => null) }));

    expect(result.output).toContain('Skipped');
    expect((await latestRun('commander_spellbook')).status).toBe('skipped');
    expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
  });

  test('a combo import before any catalog import drops every combo', async () => {
    await resetCardCatalog();

    await expectImported(spellbookFixtureVariants);

    expect(await comboIds()).toEqual([]);
    expect((await latestRun('commander_spellbook')).counts).toMatchObject({ combos: { staged: 4, dropped: 4 } });
  });

  test("a combo import leaves the card catalog and the user's profile unchanged", async () => {
    const before = await Promise.all([
      alice.client.from('profiles').select('*'),
      alice.client.from('cards').select('*', { count: 'exact', head: true }),
      latestRun('catalog'),
    ]);

    await expectImported(spellbookFixtureVariants);

    expect(
      await Promise.all([
        alice.client.from('profiles').select('*'),
        alice.client.from('cards').select('*', { count: 'exact', head: true }),
        latestRun('catalog'),
      ]),
    ).toEqual(before);
  });

  test('the stage function refuses a card catalog target in a combo run', async () => {
    const { data: run } = await importKeyClient.rpc('begin_import_run', {
      source: 'commander_spellbook',
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

  test('the daily run retries a combo import whose latest run failed', async () => {
    await runComboImport(await spellbookFixture({ file: (text) => text.slice(0, text.length / 2) }));
    expect((await latestRun('commander_spellbook')).status).toBe('failed');

    const result = await runImportCommand('retry-weekly', '--variants', spellbookFixtureVariants);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Retrying the commander_spellbook import');
    expect((await latestRun('commander_spellbook')).status).toBe('succeeded');
    expect(await comboIds()).toEqual([kikiJikiCombo, thassasOracleCombo]);
  });
});
