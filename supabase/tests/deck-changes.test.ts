import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type DeckChangePage, type DeckRole } from '../decks';
import { basicLands, catalogFixture, resetCardCatalog, runCatalogImport, withBasicLands } from './catalog-import-command';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const [forest, wastes, snowCoveredForest] = basicLands.map((land) => land.oracle_id) as [string, string, string];

beforeAll(async () => {
  await resetCardCatalog();
  const manifest = await catalogFixture({ oracleCards: withBasicLands, defaultCards: withBasicLands });
  expect((await runCatalogImport(manifest)).exitCode).toBe(0);
});

async function created(user: TestUser, name = 'Atraxa') {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function added(user: TestUser, deckId: string, copyId: string) {
  const { error } = await user.client.rpc('add_deck_card', { request: { deck_id: deckId, copy_id: copyId, unprotect: false } });
  expect(error).toBeNull();
}

async function listDeckChanges(client: AppClient, query: unknown) {
  const { data, error } = await client.rpc('list_deck_changes', { query: query as Json });
  return { page: data as unknown as DeckChangePage | null, error: error && readDeckError(error) };
}

async function deckChangesOf(user: TestUser, query: Record<string, unknown>) {
  const { page, error } = await listDeckChanges(user.client, query);
  expect(error).toBeNull();
  return page!;
}

type SeededLine = { copy_id: string; card_printing_id: string; place_before: DeckRole | null; place_after: DeckRole | null };

type SeededBasicLandLine = { oracle_id: string; count_before: number; count_after: number };

type SeededDeckChange = {
  revision: number;
  kind: string;
  lines?: SeededLine[];
  basic_land_lines?: SeededBasicLandLine[];
  reverted_by_revision?: number;
};

async function seedDeckChanges(user: TestUser, deckId: string, changes: SeededDeckChange[]) {
  await asDatabaseOwner(async (database) => {
    const ids = new Map<number, string>();
    for (const change of changes) {
      const [row] = await database`
        insert into public.deck_changes (user_id, deck_id, revision, kind, changed_at)
        values (${user.userId}, ${deckId}, ${change.revision}, ${change.kind}, ${new Date(Date.UTC(2026, 9, 15, 9, change.revision))})
        returning id`;
      ids.set(change.revision, row.id);
      for (const line of change.lines ?? []) {
        await database`
          insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
          values (${user.userId}, ${row.id}, ${line.copy_id}, ${line.card_printing_id}, 'nonfoil', ${line.place_before}, ${line.place_after})`;
      }
      for (const line of change.basic_land_lines ?? []) {
        await database`
          insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
          values (${user.userId}, ${row.id}, ${line.oracle_id}, ${line.count_before}, ${line.count_after})`;
      }
    }
    for (const change of changes.filter((candidate) => candidate.reverted_by_revision)) {
      await database`
        update public.deck_changes set reverted_by = ${ids.get(change.reverted_by_revision!)!}
        where id = ${ids.get(change.revision)!}`;
    }
  });
}

function revisionsOf(page: DeckChangePage) {
  return page.items.map((change) => change.revision);
}

describe('listing deck changes', () => {
  test('returns deck changes newest first with their kind, time, revision, reverted flag, and lines', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    const delver = await scannedCopy(user, delverInnistrad);
    await added(user, deckId, curator);
    await added(user, deckId, delver);

    const page = await deckChangesOf(user, { deck_id: deckId });

    expect(page).toEqual({
      items: [
        {
          deck_change_id: expect.any(String),
          revision: 2,
          kind: 'added',
          changed_at: expect.any(String),
          reverted: false,
          lines: [
            {
              kind: 'copy',
              copy_id: delver,
              name: 'Delver of Secrets // Insectile Aberration',
              image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/'), expect.stringContaining('https://cards.scryfall.io/normal/')],
              type_line: 'Creature — Human Wizard // Creature — Human Insect',
              place_before: null,
              place_after: 'main',
            },
          ],
        },
        {
          deck_change_id: expect.any(String),
          revision: 1,
          kind: 'added',
          changed_at: expect.any(String),
          reverted: false,
          lines: [
            {
              kind: 'copy',
              copy_id: curator,
              name: 'Angelic Curator',
              image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/')],
              type_line: 'Creature — Angel Spirit',
              place_before: null,
              place_after: 'main',
            },
          ],
        },
      ],
      next_cursor: null,
    });
    expect(Date.parse(page.items[0]!.changed_at)).toBeGreaterThanOrEqual(Date.parse(page.items[1]!.changed_at));
  });

  test('a new deck has no deck changes', async () => {
    const user = await signUpNewUser();

    expect(await deckChangesOf(user, { deck_id: await created(user) })).toEqual({ items: [], next_cursor: null });
  });

  test('returns 20 deck changes a page, and the cursor reads the next page', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await seedDeckChanges(
      user,
      deckId,
      Array.from({ length: 25 }, (_, index) => ({ revision: index + 1, kind: 'added' })),
    );

    const first = await deckChangesOf(user, { deck_id: deckId });
    const second = await deckChangesOf(user, { deck_id: deckId, cursor: first.next_cursor });

    expect(revisionsOf(first)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index));
    expect(first.next_cursor).toEqual(expect.any(String));
    expect(revisionsOf(second)).toEqual([5, 4, 3, 2, 1]);
    expect(second.next_cursor).toBeNull();
  });

  test('limit sets the page size, and a null cursor reads the first page', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await seedDeckChanges(user, deckId, [1, 2, 3].map((revision) => ({ revision, kind: 'added' })));

    const first = await deckChangesOf(user, { deck_id: deckId, cursor: null, limit: 2 });
    const second = await deckChangesOf(user, { deck_id: deckId, cursor: first.next_cursor, limit: 2 });

    expect(revisionsOf(first)).toEqual([3, 2]);
    expect(revisionsOf(second)).toEqual([1]);
    expect(second.next_cursor).toBeNull();
  });

  test("a cursor from another deck's deck changes is refused", async () => {
    const user = await signUpNewUser();
    const [atraxa, kinnan] = [await created(user, 'Atraxa'), await created(user, 'Kinnan')];
    await seedDeckChanges(user, atraxa, [1, 2].map((revision) => ({ revision, kind: 'added' })));
    const first = await deckChangesOf(user, { deck_id: atraxa, limit: 1 });

    const { error } = await listDeckChanges(user.client, { deck_id: kinnan, cursor: first.next_cursor });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test('a deck change made after the first page does not repeat a deck change on the next page', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await seedDeckChanges(user, deckId, [1, 2, 3].map((revision) => ({ revision, kind: 'added' })));
    const first = await deckChangesOf(user, { deck_id: deckId, limit: 2 });

    await seedDeckChanges(user, deckId, [{ revision: 4, kind: 'removed' }]);

    expect(revisionsOf(await deckChangesOf(user, { deck_id: deckId, cursor: first.next_cursor, limit: 2 }))).toEqual([1]);
  });

  test('a removed deck change has a copy line from the main deck to out of the deck', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);

    const { error } = await user.client.rpc('remove_deck_card', { request: { copy_id: copyId } });
    expect(error).toBeNull();

    const [change] = (await deckChangesOf(user, { deck_id: deckId })).items;
    expect(change).toMatchObject({
      revision: 2,
      kind: 'removed',
      lines: [{ kind: 'copy', copy_id: copyId, name: 'Angelic Curator', place_before: 'main', place_after: null }],
    });
  });

  test('each kind of deck change returns its kind and the places of its copy lines before and after', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = { copy_id: await scannedCopy(user), card_printing_id: angelicCurator };
    const delver = { copy_id: await scannedCopy(user, delverInnistrad), card_printing_id: delverInnistrad };
    await seedDeckChanges(user, deckId, [
      { revision: 1, kind: 'added', lines: [{ ...curator, place_before: null, place_after: 'main' }] },
      { revision: 2, kind: 'made_commander', lines: [{ ...curator, place_before: 'main', place_after: 'commander' }] },
      { revision: 3, kind: 'made_partner', lines: [{ ...delver, place_before: 'main', place_after: 'commander' }] },
      { revision: 4, kind: 'moved_to_main_deck', lines: [{ ...delver, place_before: 'commander', place_after: 'main' }] },
      { revision: 5, kind: 'removed', lines: [{ ...delver, place_before: 'main', place_after: null }] },
      { revision: 6, kind: 'removed_from_collection', lines: [{ ...curator, place_before: 'commander', place_after: null }] },
      {
        revision: 7,
        kind: 'revert',
        lines: [
          { ...curator, place_before: null, place_after: 'commander' },
          { ...delver, place_before: null, place_after: 'main' },
        ],
      },
    ]);

    const page = await deckChangesOf(user, { deck_id: deckId });

    expect(
      page.items.map((change) => [
        change.kind,
        change.lines.map((line) => line.kind === 'copy' && [line.name, line.place_before, line.place_after]),
      ]),
    ).toEqual([
      [
        'revert',
        [
          ['Angelic Curator', null, 'commander'],
          ['Delver of Secrets // Insectile Aberration', null, 'main'],
        ],
      ],
      ['removed_from_collection', [['Angelic Curator', 'commander', null]]],
      ['removed', [['Delver of Secrets // Insectile Aberration', 'main', null]]],
      ['moved_to_main_deck', [['Delver of Secrets // Insectile Aberration', 'commander', 'main']]],
      ['made_partner', [['Delver of Secrets // Insectile Aberration', 'main', 'commander']]],
      ['made_commander', [['Angelic Curator', 'main', 'commander']]],
      ['added', [['Angelic Curator', null, 'main']]],
    ]);
  });

  test('a basic_lands deck change has a basic land line for each changed kind with its counts before and after, in the order of the kinds', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const counts = async (request: { oracle_id: string; count: number }[]) => {
      const { error } = await user.client.rpc('set_basic_lands', { request: { deck_id: deckId, counts: request } });
      expect(error).toBeNull();
    };
    await counts([
      { oracle_id: snowCoveredForest, count: 2 },
      { oracle_id: forest, count: 8 },
    ]);
    await counts([
      { oracle_id: wastes, count: 1 },
      { oracle_id: forest, count: 6 },
    ]);

    const page = await deckChangesOf(user, { deck_id: deckId });

    expect(page.items.map((change) => [change.kind, change.lines])).toEqual([
      [
        'basic_lands',
        [
          { kind: 'basic_land', oracle_id: forest, name: 'Forest', image_uris: [expect.stringContaining('https://cards.scryfall.io/')], count_before: 8, count_after: 6 },
          { kind: 'basic_land', oracle_id: wastes, name: 'Wastes', image_uris: [expect.stringContaining('https://cards.scryfall.io/')], count_before: 0, count_after: 1 },
        ],
      ],
      [
        'basic_lands',
        [
          expect.objectContaining({ kind: 'basic_land', name: 'Forest', count_before: 0, count_after: 8 }),
          expect.objectContaining({ kind: 'basic_land', name: 'Snow-Covered Forest', count_before: 0, count_after: 2 }),
        ],
      ],
    ]);
  });

  test('copy lines come before basic land lines', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const copyId = await scannedCopy(user);
    await seedDeckChanges(user, deckId, [
      {
        revision: 1,
        kind: 'revert',
        lines: [{ copy_id: copyId, card_printing_id: angelicCurator, place_before: null, place_after: 'main' }],
        basic_land_lines: [{ oracle_id: forest, count_before: 3, count_after: 0 }],
      },
    ]);

    const [change] = (await deckChangesOf(user, { deck_id: deckId })).items;

    expect(change!.lines.map((line) => [line.kind, line.name])).toEqual([
      ['copy', 'Angelic Curator'],
      ['basic_land', 'Forest'],
    ]);
  });

  test("a deleted copy's lines still show its card", async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);

    const { error } = await user.client.rpc('delete_copy', { request: { copy_id: copyId } });
    expect(error).toBeNull();

    const [change] = (await deckChangesOf(user, { deck_id: deckId })).items;
    expect(change!.lines).toEqual([
      expect.objectContaining({ copy_id: copyId, name: 'Angelic Curator', image_uris: [expect.stringContaining('https://cards.scryfall.io/')] }),
    ]);
  });

  test('a reverted deck change has the reverted flag', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await seedDeckChanges(user, deckId, [
      { revision: 1, kind: 'added', reverted_by_revision: 3 },
      { revision: 2, kind: 'added', reverted_by_revision: 3 },
      { revision: 3, kind: 'revert' },
    ]);

    const page = await deckChangesOf(user, { deck_id: deckId });

    expect(page.items.map((change) => [change.kind, change.reverted])).toEqual([
      ['revert', false],
      ['added', true],
      ['added', true],
    ]);
  });

  test('deleting a deck deletes its reverted deck changes', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await seedDeckChanges(user, deckId, [
      { revision: 1, kind: 'added', reverted_by_revision: 2 },
      { revision: 2, kind: 'revert' },
    ]);

    const { error } = await user.client.rpc('delete_deck', { request: { deck_id: deckId } });

    expect(error).toBeNull();
    expect((await user.client.from('deck_changes').select('id').eq('deck_id', deckId)).data).toEqual([]);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const user = await signUpNewUser();

    const { error } = await listDeckChanges(user.client, { deck_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test.each<[string, (deckId: string) => unknown, string, string | null]>([
    ['a query that is not an object', () => [], 'invalid_argument', null],
    ['a query with no deck ID', () => ({ limit: 20 }), 'invalid_argument', 'deck_id'],
    ['a deck ID that is not a UUID', () => ({ deck_id: 'deck-1' }), 'invalid_argument', 'deck_id'],
    ['an unknown field', (deckId) => ({ deck_id: deckId, sort: 'revision' }), 'invalid_argument', 'sort'],
    ['a limit of 0', (deckId) => ({ deck_id: deckId, limit: 0 }), 'invalid_argument', 'limit'],
    ['a limit above 50', (deckId) => ({ deck_id: deckId, limit: 51 }), 'invalid_argument', 'limit'],
    ['a cursor that is not a string', (deckId) => ({ deck_id: deckId, cursor: 20 }), 'invalid_argument', 'cursor'],
    ['a cursor that was not issued', (deckId) => ({ deck_id: deckId, cursor: 'abc' }), 'invalid_cursor', 'cursor'],
    ['a revision as the cursor', (deckId) => ({ deck_id: deckId, cursor: '5' }), 'invalid_cursor', 'cursor'],
  ])('%s is refused', async (_, query, code, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user);

    const { error } = await listDeckChanges(user.client, query(deckId));

    expect(error).toMatchObject({ code, field });
  });
});

describe('access', () => {
  test("a user cannot list another user's deck changes", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const deckId = await created(alice);
    await added(alice, deckId, await scannedCopy(alice));

    const { page, error } = await listDeckChanges(bob.client, { deck_id: deckId });

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
    expect((await deckChangesOf(alice, { deck_id: deckId })).items).toHaveLength(1);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot list deck changes', async (_, client) => {
    const { error } = await client().rpc('list_deck_changes', { query: { deck_id: crypto.randomUUID() } });

    expect(error?.code).toBe(permissionDenied);
  });

  test('a user cannot mark a deck change reverted directly', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await added(user, deckId, await scannedCopy(user));
    const [change] = (await deckChangesOf(user, { deck_id: deckId })).items;

    const { error } = await user.client.from('deck_changes').update({ reverted_by: change!.deck_change_id }).eq('id', change!.deck_change_id);

    expect(error?.code).toBe(permissionDenied);
    expect((await deckChangesOf(user, { deck_id: deckId })).items[0]!.reverted).toBe(false);
  });
});
