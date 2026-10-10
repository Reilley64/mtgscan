import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Embedder } from '../import/card-embeddings';
import { ImportFailed } from '../import/import-run';
import {
  catalogFixture,
  catalogFixtureManifest,
  latestRun,
  oracleTagOf,
  resetCardCatalog,
  runCardEmbeddingImport,
  runCatalogImport,
  runOracleTagCommand,
  runOracleTagImport,
} from './catalog-import-command';
import { embeddingDimensions, wordCountEmbedding } from './fake-text-embedder';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const laterSnapshotAt = '2026-10-16T21:00:00.000+00:00';
const aetherTunnelText = [
  'Aether Tunnel',
  'Enchantment — Aura',
  'Enchant creature',
  "Enchanted creature gets +1/+0 and can't be blocked.",
  'Keywords: Enchant',
  'Tags: gives unblockable',
].join('\n');

let alice: TestUser;

function recordingEmbedder(texts: string[], embed: Embedder = async (text) => wordCountEmbedding(text)): Embedder {
  return async (text) => {
    texts.push(text);
    return embed(text);
  };
}

async function embedCards(embedder: Embedder = recordingEmbedder([])) {
  const run = await runCardEmbeddingImport(embedder);
  expect(run.status).toBe('succeeded');
  return run;
}

async function cardCount() {
  const { count, error } = await alice.client.from('cards').select('*', { count: 'exact', head: true });
  expect(error).toBeNull();
  return count!;
}

async function embeddingFreshness() {
  const { data, error } = await alice.client.rpc('catalog_freshness');
  expect(error).toBeNull();
  return data!.find((row) => row.source === 'card_embeddings')!;
}

async function failedRun(embedder: Embedder) {
  const failure = await runCardEmbeddingImport(embedder).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ImportFailed);
  return latestRun('card_embeddings');
}

beforeAll(async () => {
  alice = await signUpNewUser();
});

beforeEach(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
});

describe('card embeddings import', () => {
  test('a run embeds every card once, from its name, type line, Oracle text, keywords, and Oracle tag labels', async () => {
    const texts: string[] = [];

    const run = await embedCards(recordingEmbedder(texts));

    expect(texts).toHaveLength(await cardCount());
    expect(texts).toContain(aetherTunnelText);
    expect(run.counts).toMatchObject({ card_embeddings: { staged: texts.length, inserted: texts.length, updated: 0 } });
  });

  test('a second run with no new embedding text embeds nothing, succeeds, and keeps card embeddings fresh', async () => {
    await embedCards();
    const texts: string[] = [];

    const run = await embedCards(recordingEmbedder(texts));

    expect(texts).toEqual([]);
    expect(run.counts).toMatchObject({ card_embeddings: { staged: 0, inserted: 0, updated: 0 } });
    expect((await embeddingFreshness()).is_stale).toBe(false);
  });

  test('a card whose Oracle text changes is embedded again in the next run, and no other card is', async () => {
    await embedCards();
    const changed = await catalogFixture({
      updatedAt: laterSnapshotAt,
      oracleCards: (records) =>
        records.map((card) =>
          card.name === 'Aether Tunnel' ? { ...card, oracle_text: 'Enchant creature\nEnchanted creature has shroud.' } : card,
        ),
    });
    expect((await runCatalogImport(changed)).exitCode).toBe(0);
    const texts: string[] = [];

    const run = await embedCards(recordingEmbedder(texts));

    expect(texts).toEqual([aetherTunnelText.replace("Enchanted creature gets +1/+0 and can't be blocked.", 'Enchanted creature has shroud.')]);
    expect(run.counts).toMatchObject({ card_embeddings: { staged: 1, inserted: 0, updated: 1 } });
  });

  test('a disabled Oracle tag leaves the embedding text in the next run', async () => {
    await embedCards();
    expect((await runOracleTagCommand('disable', (await oracleTagOf('gives-unblockable')).id)).exitCode).toBe(0);
    const texts: string[] = [];

    await embedCards(recordingEmbedder(texts));

    expect(texts).toContain(aetherTunnelText.replace('\nTags: gives unblockable', ''));
  });

  test('a card embedding of the wrong size fails the run and keeps the last good snapshot', async () => {
    const good = await embedCards();
    const changed = await catalogFixture({
      updatedAt: laterSnapshotAt,
      oracleCards: (records) =>
        records.map((card) => (card.name === 'Aether Tunnel' ? { ...card, oracle_text: 'Enchant creature' } : card)),
    });
    expect((await runCatalogImport(changed)).exitCode).toBe(0);

    const run = await failedRun(async () => new Array(embeddingDimensions - 1).fill(0.01));

    expect(run.failure_reason).toStartWith('Stage card_embeddings batch 1:');
    expect((await embeddingFreshness()).snapshot_at).toBe(good.source_updated_at);
  });

  test('embedding text that changes during the run fails the run with the reason', async () => {
    const aetherTunnelTag = (await oracleTagOf('gives-unblockable')).id;
    const disableTagMidRun = recordingEmbedder([], async (text) => {
      if (text === aetherTunnelText) {
        expect((await runOracleTagCommand('disable', aetherTunnelTag)).exitCode).toBe(0);
      }
      return wordCountEmbedding(text);
    });

    const run = await failedRun(disableTagMidRun);

    expect(run.failure_reason).toMatch(/^card_embeddings: the embedding text of \d+ staged rows changed during the run$/);
    expect((await embeddingFreshness()).snapshot_at).toBeNull();
  });

  test('the next run embeds the cards that a failed run left out', async () => {
    await failedRun(async () => [0]);
    const texts: string[] = [];

    await embedCards(recordingEmbedder(texts));

    expect(texts).toHaveLength(await cardCount());
  });

  test('only the secret key can read the embedding texts', async () => {
    const callers = [anonymousClient(), alice.client];
    for (const client of callers) {
      const { data, error } = await client.rpc('list_card_embedding_texts', {});
      expect(data).toBeNull();
      expect(error?.code).toBe(permissionDenied);
    }
    const { data } = await secretKeyClient().rpc('list_card_embedding_texts', { row_limit: 1 });
    expect(data).toHaveLength(1);
  });

  test('app users cannot read card embeddings', async () => {
    await embedCards();

    const { data, error } = await alice.client.from('card_embeddings').select('oracle_id');

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});
