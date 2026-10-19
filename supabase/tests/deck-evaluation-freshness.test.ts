import { beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Database } from '../database.types';
import { listDecks } from '../decks';
import {
  catalogFixture,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  expectSuccess,
  oracleTagFixtureSnapshotAt,
  oracleTagOf,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runImportCommand,
  runOracleTagCommand,
  runOracleTagImport,
  spellbookFixture,
  spellbookFixtureSnapshotAt,
  spellbookFixtureVariants,
} from './catalog-import-command';
import { replyOf } from './database-calls';
import { deckOf } from './deck-calls';
import { deckWithCards, withFailingRecompute } from './deck-evaluation-seeds';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

type ImportSource = Database['public']['Enums']['import_source'];

const laterSnapshotAt = '2026-10-16T21:00:00.123+00:00';
const rulesDataTimes = {
  catalog_at: catalogFixtureSnapshotAt,
  oracle_tags_at: oracleTagFixtureSnapshotAt,
  commander_spellbook_at: spellbookFixtureSnapshotAt,
  validity_rules_data_at: catalogFixtureSnapshotAt,
};

let user: TestUser;
let deckId: string;

async function readEvaluation() {
  const listed = (await replyOf(user.client, listDecks)).items.find((item) => item.deck_id === deckId)!.evaluation!;
  const evaluation = (await deckOf(user, deckId)).evaluation!;
  expect({ validity_stale: listed.validity_stale, bracket_stale: listed.bracket_stale }).toEqual({
    validity_stale: evaluation.validity_stale,
    bracket_stale: evaluation.bracket_stale,
  });
  return evaluation;
}

async function ageSnapshot(source: ImportSource, days: number) {
  await asDatabaseOwner(
    (database) => database`
      update public.import_snapshots
      set succeeded_at = now() - ${days} * interval '1 day'
      where source = ${source}
    `,
  );
}

async function signedUpWithADeck() {
  user = await signUpNewUser();
  deckId = await deckWithCards(user);
}

describe('before any Oracle tag or combo import', () => {
  beforeEach(async () => {
    await resetCardCatalog();
    await expectSuccess(runCatalogImport(catalogFixtureManifest));
    await signedUpWithADeck();
  });

  test('a source that was never imported is not stale', async () => {
    expect(await readEvaluation()).toMatchObject({
      validity_stale: false,
      bracket_stale: false,
      no_oracle_tag_data: true,
      no_combo_data: true,
    });
  });
});

describe('stale deck evaluations', () => {
  beforeEach(async () => {
    await resetCardCatalog();
    await expectSuccess(runCatalogImport(catalogFixtureManifest));
    await expectSuccess(runOracleTagImport(catalogFixtureManifest));
    await expectSuccess(runComboImport(spellbookFixtureVariants));
    await signedUpWithADeck();
  });

  test('a deck evaluation of fresh rules data is not stale', async () => {
    expect(await readEvaluation()).toMatchObject({ validity_stale: false, bracket_stale: false, ...rulesDataTimes });
  });

  test('the card catalog 7 days after its last successful import makes validity and the estimated bracket stale', async () => {
    await ageSnapshot('catalog', 6.9);
    expect(await readEvaluation()).toMatchObject({ validity_stale: false, bracket_stale: false });

    await ageSnapshot('catalog', 7.1);
    expect(await readEvaluation()).toMatchObject({ validity_stale: true, bracket_stale: true, ...rulesDataTimes });
  });

  test.each<[string, ImportSource]>([
    ['Oracle tag', 'oracle_tags'],
    ['Commander Spellbook', 'commander_spellbook'],
  ])('a last successful %s import 7 days ago makes only the estimated bracket stale', async (_, source) => {
    await ageSnapshot(source, 6.9);
    expect(await readEvaluation()).toMatchObject({ validity_stale: false, bracket_stale: false });

    await ageSnapshot(source, 7.1);
    expect(await readEvaluation()).toMatchObject({ validity_stale: false, bracket_stale: true, ...rulesDataTimes });
  });

  test('a failed card catalog import keeps a stale deck evaluation and the snapshot time it used', async () => {
    await ageSnapshot('catalog', 7.1);

    const result = await runCatalogImport(
      await catalogFixture({ updatedAt: laterSnapshotAt, defaultCardsFile: () => new Uint8Array([1, 2, 3]) }),
    );

    expect(result.exitCode).not.toBe(0);
    expect(await readEvaluation()).toMatchObject({ validity_stale: true, bracket_stale: true, ...rulesDataTimes });
  });

  test('a deck evaluation behind the card catalog keeps its snapshot time, and validity and the estimated bracket are stale until the recompute', async () => {
    await withFailingRecompute(async () => runCatalogImport(await catalogFixture({ updatedAt: laterSnapshotAt })));

    expect(await readEvaluation()).toMatchObject({ validity_stale: true, bracket_stale: true, ...rulesDataTimes });

    await expectSuccess(runImportCommand('deck-evaluations'));
    expect(await readEvaluation()).toMatchObject({
      validity_stale: false,
      bracket_stale: false,
      catalog_at: laterSnapshotAt,
      validity_rules_data_at: laterSnapshotAt,
    });
  });

  test.each<[string, () => Promise<unknown>]>([
    ['Oracle tag', async () => runOracleTagImport(await catalogFixture({ updatedAt: laterSnapshotAt }))],
    ['Commander Spellbook', async () => runComboImport(await spellbookFixture({ timestamp: laterSnapshotAt }))],
  ])('a deck evaluation behind the %s snapshot keeps its times, and only the estimated bracket is stale', async (_, runImport) => {
    const before = await readEvaluation();

    await withFailingRecompute(runImport);

    expect(await readEvaluation()).toMatchObject({
      validity_stale: false,
      bracket_stale: true,
      ...rulesDataTimes,
      bracket_rules_data_at: before.bracket_rules_data_at,
    });
  });

  test('an Oracle tag disabled after the deck evaluation was judged makes only the estimated bracket stale', async () => {
    const sweeper = (await oracleTagOf('sweeper')).id;

    await withFailingRecompute(() => runOracleTagCommand('disable', sweeper));

    expect(await readEvaluation()).toMatchObject({ validity_stale: false, bracket_stale: true, ...rulesDataTimes });
  });
});
