import { beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Database } from '../database.types';

import {
  type CommandResult,
  catalogFixture,
  catalogFixtureManifest,
  expectSuccess,
  oracleTagOf,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runImportCommand,
  runOracleTagCommand,
  runOracleTagImport,
  spellbookFixture,
  spellbookFixtureVariants,
} from './catalog-import-command';
import { deckWithCards, storedEvaluation, storedEvaluations, withFailingRecompute } from './deck-evaluation-seeds';
import { secretKeyClient, signUpNewUser } from './local-stack';

setDefaultTimeout(60_000);

type ImportSource = Database['public']['Enums']['import_source'];

const laterSnapshotAt = '2026-10-16T21:00:00.000+00:00';

let deckId: string;

beforeEach(async () => {
  await resetCardCatalog();
  await expectSuccess(runCatalogImport(catalogFixtureManifest));
  await expectSuccess(runOracleTagImport(catalogFixtureManifest));
  await expectSuccess(runComboImport(spellbookFixtureVariants));
  deckId = await deckWithCards(await signUpNewUser());
});

async function judgedAt() {
  return (await storedEvaluation(deckId))!.judged_at;
}

async function snapshotAt(source: ImportSource) {
  const { data, error } = await secretKeyClient().rpc('catalog_freshness');
  expect(error).toBeNull();
  return new Date(data!.find((row) => row.source === source)!.snapshot_at!);
}

const imports: [ImportSource, () => Promise<CommandResult>][] = [
  ['catalog', async () => runCatalogImport(await catalogFixture({ updatedAt: laterSnapshotAt }))],
  ['oracle_tags', async () => runOracleTagImport(await catalogFixture({ updatedAt: laterSnapshotAt }))],
  ['commander_spellbook', async () => runComboImport(await spellbookFixture({ timestamp: laterSnapshotAt }))],
];

describe('the recompute after rules data changes', () => {
  test.each(imports)('a successful %s import recomputes every deck evaluation', async (_, runImport) => {
    const before = await judgedAt();

    const output = await expectSuccess(runImport());

    expect(output).toMatch(/Recomputed \d+ deck evaluations in \d+ ms\./);
    expect((await judgedAt()) > before).toBe(true);
  });

  test('the catalog import recomputes with the new card catalog snapshot time', async () => {
    await expectSuccess(runCatalogImport(await catalogFixture({ updatedAt: laterSnapshotAt })));

    expect((await storedEvaluation(deckId))!.catalog_at).toEqual(new Date(laterSnapshotAt));
  });

  test('a skipped import recomputes nothing', async () => {
    const before = await storedEvaluations();

    const output = await expectSuccess(runCatalogImport(catalogFixtureManifest));

    expect(output).toContain('Skipped');
    expect(output).not.toContain('Recomputed');
    expect(await storedEvaluations()).toEqual(before);
  });

  test('disabling and enabling an Oracle tag each recompute every deck evaluation', async () => {
    const sweeper = (await oracleTagOf('sweeper')).id;
    const before = await judgedAt();

    expect(await expectSuccess(runOracleTagCommand('disable', sweeper))).toContain('Recomputed');
    const afterDisable = await judgedAt();
    expect(await expectSuccess(runOracleTagCommand('enable', sweeper))).toContain('Recomputed');

    expect(afterDisable > before).toBe(true);
    expect((await judgedAt()) > afterDisable).toBe(true);
  });

  test.each(imports)(
    'a failed recompute fails the %s import, keeps the imported data, and changes no deck evaluation',
    async (source, runImport) => {
      const before = await storedEvaluations();

      const result = await withFailingRecompute(runImport);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Recompute deck evaluations: Forced deck evaluation failure');
      expect(await storedEvaluations()).toEqual(before);
      expect(await snapshotAt(source)).toEqual(new Date(laterSnapshotAt));
    },
  );

  test('a failed recompute fails the Oracle tag command and keeps the tag disabled', async () => {
    const sweeper = (await oracleTagOf('sweeper')).id;
    const before = await storedEvaluations();

    const result = await withFailingRecompute(() => runOracleTagCommand('disable', sweeper));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Recompute deck evaluations: Forced deck evaluation failure');
    expect(await storedEvaluations()).toEqual(before);
    const { data } = await secretKeyClient().from('disabled_tags').select('tag_id');
    expect(data).toEqual([{ tag_id: sweeper }]);
  });
});

describe('deck-evaluations', () => {
  test('it does nothing when no deck evaluation is behind', async () => {
    const before = await storedEvaluations();

    const output = await expectSuccess(runImportCommand('deck-evaluations'));

    expect(output).toContain('No deck evaluation is behind.');
    expect(await storedEvaluations()).toEqual(before);
  });

  test.each(imports)('it recomputes after a %s import whose recompute failed', async (_, runImport) => {
    await withFailingRecompute(runImport);
    const before = await judgedAt();

    expect(await expectSuccess(runImportCommand('deck-evaluations'))).toContain('Recomputed');

    expect((await judgedAt()) > before).toBe(true);
    expect(await expectSuccess(runImportCommand('deck-evaluations'))).toContain('No deck evaluation is behind.');
  });

  test('it recomputes when an Oracle tag was disabled or enabled after a deck evaluation was judged', async () => {
    const sweeper = (await oracleTagOf('sweeper')).id;
    await expectSuccess(runOracleTagCommand('disable', sweeper));
    await withFailingRecompute(() => runOracleTagCommand('enable', sweeper));
    const before = await judgedAt();

    expect(await expectSuccess(runImportCommand('deck-evaluations'))).toContain('Recomputed');

    expect((await judgedAt()) > before).toBe(true);
    expect(await expectSuccess(runImportCommand('deck-evaluations'))).toContain('No deck evaluation is behind.');
  });
});
