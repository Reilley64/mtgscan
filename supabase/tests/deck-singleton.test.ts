import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckEvaluationCopy } from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

type Printing = { name: string; id: string; image: string };

const angelicCurator: Printing = {
  name: 'Angelic Curator',
  id: '332352c2-98f2-4eb8-b49a-026a39df227b',
  image: 'https://cards.scryfall.io/normal/front/3/3/332352c2-98f2-4eb8-b49a-026a39df227b.jpg?1783926792',
};
const angelicCuratorPromo: Printing = {
  name: 'Angelic Curator',
  id: 'c63ba2da-6dea-44ac-8439-527222da565b',
  image: 'https://cards.scryfall.io/normal/front/c/6/c63ba2da-6dea-44ac-8439-527222da565b.jpg?1783946254',
};
const relentlessRats: Printing = {
  name: 'Relentless Rats',
  id: '75f47b6e-9557-4853-b8d6-7602a91c59a7',
  image: 'https://cards.scryfall.io/normal/front/7/5/75f47b6e-9557-4853-b8d6-7602a91c59a7.jpg?1783935158',
};
const sevenDwarves: Printing = {
  name: 'Seven Dwarves',
  id: '464adbae-70ea-48e1-b8ae-b404766f7a5a',
  image: 'https://cards.scryfall.io/normal/front/4/6/464adbae-70ea-48e1-b8ae-b404766f7a5a.jpg?1783932616',
};
const tolabow: Printing = {
  name: 'Tolabow, Loch Rascal',
  id: 'f42c02c2-e3d8-4690-8a93-7c7a4c96bdd6',
  image: 'https://cards.scryfall.io/normal/front/f/4/f42c02c2-e3d8-4690-8a93-7c7a4c96bdd6.jpg?1787065723',
};

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error && readDeckError(error)).toBeNull();
}

async function added(user: TestUser, deckId: string, printing: Printing, count: number) {
  const scanned = stack(printing.id, { copies: count });
  await committed(user, scanBatch([scanned]));
  const cards: DeckEvaluationCopy[] = [];
  for (const copyId of scanned.copy_ids) {
    await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
    cards.push({ kind: 'copy', copy_id: copyId, name: printing.name, image_uris: [printing.image] });
  }
  return cards;
}

async function deckOf(user: TestUser, copies: [Printing, number][]) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name: 'Atraxa' } });
  expect(error).toBeNull();
  const deckId = (data as unknown as CreatedDeck).deck_id;
  const cards: DeckEvaluationCopy[] = [];
  for (const [printing, count] of copies) {
    cards.push(...(await added(user, deckId, printing, count)));
  }
  return { deckId, cards };
}

async function singletonOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  const { violations, undetermined } = (data as unknown as Deck).evaluation!;
  return {
    violations: violations.filter((violation) => violation.rule === 'singleton'),
    undetermined: undetermined.filter((check) => check.rule === 'singleton'),
  };
}

const byCopyId = (cards: DeckEvaluationCopy[]) => cards.toSorted((a, b) => a.copy_id.localeCompare(b.copy_id));

describe('singleton', () => {
  test('two copies of a card break singleton, whatever their card printings and roles', async () => {
    const user = await signUpNewUser();
    const { deckId, cards } = await deckOf(user, [
      [angelicCurator, 1],
      [angelicCuratorPromo, 1],
      [relentlessRats, 1],
    ]);
    await succeeded(user, 'set_deck_commander', { copy_id: cards[0]!.copy_id, commander: true });

    expect(await singletonOf(user, deckId)).toEqual({
      violations: [
        {
          rule: 'singleton',
          citation: 'CR 903.5b',
          message: '2 copies of Angelic Curator.',
          hint: 'Remove 1 Angelic Curator.',
          cards: byCopyId(cards.slice(0, 2)),
        },
      ],
      undetermined: [],
    });
  });

  test('singleton names each card over its copy limit, one sentence each per card, in name order', async () => {
    const user = await signUpNewUser();
    const { deckId, cards } = await deckOf(user, [
      [sevenDwarves, 9],
      [angelicCurator, 2],
    ]);

    expect(await singletonOf(user, deckId)).toEqual({
      violations: [
        {
          rule: 'singleton',
          citation: 'CR 903.5b',
          message: '2 copies of Angelic Curator. 9 copies of Seven Dwarves.',
          hint: 'Remove 1 Angelic Curator. Remove 2 Seven Dwarves.',
          cards: [...byCopyId(cards.slice(9)), ...byCopyId(cards.slice(0, 9))],
        },
      ],
      undetermined: [],
    });
  });

  test('basic lands, including snow-covered basics and Wastes, are exempt in any number', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, [[angelicCurator, 1]]);

    for (const name of ['Forest', 'Snow-Covered Forest', 'Wastes']) {
      await succeeded(user, 'change_basic_land', { deck_id: deckId, oracle_id: basicLand(name).oracle_id, by: 30 });
    }

    expect(await singletonOf(user, deckId)).toEqual({ violations: [], undetermined: [] });
  });

  test('a card that allows any number of copies is accepted in any number', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, [[relentlessRats, 12]]);

    expect(await singletonOf(user, deckId)).toEqual({ violations: [], undetermined: [] });
  });

  test('a card with a set copy limit is accepted at its limit and breaks singleton over it', async () => {
    const user = await signUpNewUser();
    const { deckId, cards } = await deckOf(user, [[sevenDwarves, 7]]);
    expect(await singletonOf(user, deckId)).toEqual({ violations: [], undetermined: [] });

    const eighth = await added(user, deckId, sevenDwarves, 1);

    expect(await singletonOf(user, deckId)).toEqual({
      violations: [
        {
          rule: 'singleton',
          citation: 'CR 903.5b',
          message: '8 copies of Seven Dwarves.',
          hint: 'Remove 1 Seven Dwarves.',
          cards: byCopyId([...cards, ...eighth]),
        },
      ],
      undetermined: [],
    });
  });

  test('a second copy of a card with an unknown copy limit makes singleton undetermined for that card, and one copy makes nothing undetermined', async () => {
    const user = await signUpNewUser();
    const { deckId, cards } = await deckOf(user, [[tolabow, 1]]);
    expect(await singletonOf(user, deckId)).toEqual({ violations: [], undetermined: [] });

    const second = await added(user, deckId, tolabow, 1);

    expect(await singletonOf(user, deckId)).toEqual({
      violations: [],
      undetermined: [
        {
          rule: 'singleton',
          reason: 'mtgscan cannot read the copy limit of Tolabow, Loch Rascal.',
          cards: byCopyId([...cards, ...second]),
        },
      ],
    });
  });
});

