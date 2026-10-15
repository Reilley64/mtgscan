import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import type { CreatedDeck, Deck, Violation } from '../decks';
import {
  basicLand,
  catalogFixture,
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  withoutCards,
} from './catalog-import-command';
import { signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const ormos = '711412f1-9ab3-48b6-91a4-77232b416a32';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
const primevalTitan = '6d5537da-112e-4679-a113-b5d7ce32a66b';
const swordOfDungeonsAndDragons = 'bf451d4b-0884-4ab5-8d85-312d9db82e76';
const island = basicLand('Island').oracle_id;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function created(user: TestUser) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name: 'Ormos' } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error).toBeNull();
}

async function addedCopy(user: TestUser, deckId: string, cardPrintingId: string) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  const copyId = scanned.copy_ids[0]!;
  await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
  return copyId;
}

async function islandsSet(user: TestUser, deckId: string, count: number) {
  await succeeded(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: island, count }] });
}

async function deckOfOrmos(user: TestUser) {
  const deckId = await created(user);
  const commander = await addedCopy(user, deckId, ormos);
  await succeeded(user, 'set_deck_commander', { copy_id: commander, commander: true });
  return deckId;
}

async function evaluationOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as Deck).evaluation!;
}

function legalityViolations(violations: Violation[]) {
  return violations.filter((violation) => violation.rule === 'banned' || violation.rule === 'not_legal');
}

const copyCard = (copyId: string, name: string) => ({
  kind: 'copy' as const,
  copy_id: copyId,
  name,
  image_uris: expect.arrayContaining([expect.any(String)]),
});

describe('banned and not legal', () => {
  test('a banned card and a card that is not legal in Commander are two separate violations with no citation', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfOrmos(user);
    const titan = await addedCopy(user, deckId, primevalTitan);
    const lotuses = [await addedCopy(user, deckId, blackLotus), await addedCopy(user, deckId, blackLotus)].sort();
    const sword = await addedCopy(user, deckId, swordOfDungeonsAndDragons);
    await islandsSet(user, deckId, 95);

    const evaluation = await evaluationOf(user, deckId);

    expect(evaluation.validity).toBe('invalid');
    expect(legalityViolations(evaluation.violations)).toEqual([
      {
        rule: 'banned',
        citation: null,
        message: 'Black Lotus is banned in Commander. Primeval Titan is banned in Commander.',
        hint: null,
        cards: [...lotuses.map((copyId) => copyCard(copyId, 'Black Lotus')), copyCard(titan, 'Primeval Titan')],
      },
      {
        rule: 'not_legal',
        citation: null,
        message: 'Sword of Dungeons & Dragons is not legal in Commander.',
        hint: null,
        cards: [copyCard(sword, 'Sword of Dungeons & Dragons')],
      },
    ]);
    expect(evaluation.violations.map((violation) => violation.rule).slice(-2)).toEqual(['banned', 'not_legal']);
    expect(evaluation.undetermined).toEqual([]);
  });

  test('a deck of legal cards and basic lands breaks neither rule', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfOrmos(user);
    await addedCopy(user, deckId, delverInnistrad);
    await islandsSet(user, deckId, 98);

    expect(await evaluationOf(user, deckId)).toMatchObject({ validity: 'valid', violations: [], undetermined: [] });
  });
});

describe('the legality check with no rules data', () => {
  test('a card that the card catalog no longer lists and a card with an unknown Commander legality make the legality check undetermined, and a violation still wins', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfOrmos(user);
    const delver = await addedCopy(user, deckId, delverInnistrad);
    const lotus = await addedCopy(user, deckId, blackLotus);
    const delverName = 'Delver of Secrets // Insectile Aberration';
    const changedCatalog = await catalogFixture({
      updatedAt: '2026-10-22T21:00:00.000+00:00',
      oracleCards: (records) =>
        withoutCards([delverName])
          .oracleCards(records)
          .map((record) =>
            record.name === 'Black Lotus'
              ? { ...record, legalities: { ...(record.legalities as object), commander: 'restricted' } }
              : record,
          ),
      defaultCards: withoutCards([delverName]).defaultCards,
    });
    expect((await runCatalogImport(changedCatalog)).exitCode).toBe(0);

    await islandsSet(user, deckId, 97);

    const evaluation = await evaluationOf(user, deckId);
    expect(evaluation).toMatchObject({ validity: 'cannot_be_determined', violations: [] });
    expect(evaluation.undetermined.filter((check) => check.rule === 'legality')).toEqual([
      {
        rule: 'legality',
        reason: `No rules data for Black Lotus. No rules data for ${delverName}.`,
        cards: [copyCard(lotus, 'Black Lotus'), copyCard(delver, delverName)],
      },
    ]);

    await addedCopy(user, deckId, primevalTitan);
    const withBanned = await evaluationOf(user, deckId);
    expect(withBanned.validity).toBe('invalid');
    expect(legalityViolations(withBanned.violations).map((violation) => violation.rule)).toEqual(['banned']);
    expect(withBanned.undetermined.map((check) => check.rule)).toContain('legality');
  });
});
