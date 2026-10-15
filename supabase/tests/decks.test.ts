import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckList, type DeckRow } from '../decks';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

async function createDeck(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('create_deck', { request: request as Json });
  return { deck: data as unknown as CreatedDeck | null, error: error && readDeckError(error) };
}

async function created(user: TestUser, name: string) {
  const { deck, error } = await createDeck(user.client, { name });
  expect(error).toBeNull();
  return deck!.deck_id;
}

async function markDeckUsed(client: AppClient, request: unknown) {
  const { error } = await client.rpc('mark_deck_used', { request: request as Json });
  return error && readDeckError(error);
}

async function writeDeck(client: AppClient, name: 'rename_deck' | 'set_deck_priority' | 'delete_deck', request: unknown) {
  const { error } = await client.rpc(name, { request: request as Json });
  return error && readDeckError(error);
}

async function getDeck(client: AppClient, query: unknown) {
  const { data, error } = await client.rpc('get_deck', { query: query as Json });
  return { deck: data as unknown as Deck | null, error: error && readDeckError(error) };
}

async function decksOf(user: TestUser) {
  const { data, error } = await user.client.rpc('list_decks');
  expect(error).toBeNull();
  return (data as unknown as DeckList).items;
}

async function deckNamesOf(user: TestUser) {
  return (await decksOf(user)).map((deck) => deck.name);
}

async function lastUsedAt(deckId: string) {
  return asDatabaseOwner(async (database) => {
    const [row] = await database`select last_used_at from public.decks where id = ${deckId}`;
    return new Date(row.last_used_at).toISOString();
  });
}

async function setLastUsedAt(deckIds: string[], time: string) {
  await asDatabaseOwner((database) => database`update public.decks set last_used_at = ${time} where id in ${database(deckIds)}`);
}

describe('creating a deck', () => {
  test('creates an empty deck with the trimmed name, at medium priority, with no commander, at revision 0', async () => {
    const user = await signUpNewUser();

    const deckId = await created(user, '  Atraxa ');

    const expected: DeckRow = {
      deck_id: deckId,
      name: 'Atraxa',
      priority: 'medium',
      card_count: 0,
      commanders: [],
      last_used_at: expect.any(String),
    };
    expect(await decksOf(user)).toEqual([expected]);
    expect((await getDeck(user.client, { deck_id: deckId })).deck).toEqual({
      ...expected,
      revision: 0,
      created_at: expect.any(String),
    });
  });

  test('a name is trimmed of tabs and line breaks too', async () => {
    const user = await signUpNewUser();

    await created(user, '\tKinnan\n');

    expect(await deckNamesOf(user)).toEqual(['Kinnan']);
  });

  test('a name of 64 characters is kept', async () => {
    const user = await signUpNewUser();

    await created(user, 'x'.repeat(64));

    expect(await deckNamesOf(user)).toEqual(['x'.repeat(64)]);
  });

  test('two decks can have the same name', async () => {
    const user = await signUpNewUser();

    const first = await created(user, 'Atraxa');
    const second = await created(user, 'atraxa');

    expect(first).not.toBe(second);
    expect((await deckNamesOf(user)).toSorted()).toEqual(['Atraxa', 'atraxa']);
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no name', {}, 'name'],
    ['an empty name', { name: '' }, 'name'],
    ['a name of only spaces', { name: '   ' }, 'name'],
    ['a name of 65 characters', { name: 'x'.repeat(65) }, 'name'],
    ['a name that is not a string', { name: 7 }, 'name'],
    ['an unknown field', { name: 'Atraxa', priority: 'high' }, 'priority'],
  ])('%s is refused with invalid_argument, and no deck is created', async (_, request, field) => {
    const user = await signUpNewUser();

    const { deck, error } = await createDeck(user.client, request);

    expect(deck).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await decksOf(user)).toEqual([]);
  });
});

describe('the deck list', () => {
  test('a user with no decks has an empty list', async () => {
    expect(await decksOf(await signUpNewUser())).toEqual([]);
  });

  test('lists the deck used most recently first, and a new deck counts as used', async () => {
    const user = await signUpNewUser();
    await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    await created(user, 'Yuriko');

    expect(await deckNamesOf(user)).toEqual(['Yuriko', 'Kinnan', 'Atraxa']);
  });

  test('marking a deck used moves it to the top', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    const before = await lastUsedAt(atraxa);

    expect(await markDeckUsed(user.client, { deck_id: atraxa })).toBeNull();

    expect(await deckNamesOf(user)).toEqual(['Atraxa', 'Kinnan']);
    expect(await lastUsedAt(atraxa) > before).toBe(true);
  });

  test('decks used at the same time sort by name ignoring case', async () => {
    const user = await signUpNewUser();
    const decks = [await created(user, 'kinnan'), await created(user, 'Yuriko'), await created(user, 'Atraxa')];
    await setLastUsedAt(decks, '2026-10-15T09:00:00Z');

    expect(await deckNamesOf(user)).toEqual(['Atraxa', 'kinnan', 'Yuriko']);
  });
});

describe('reading a deck', () => {
  test('a deck that does not exist is not_found on deck_id', async () => {
    const { deck, error } = await getDeck((await signUpNewUser()).client, { deck_id: crypto.randomUUID() });

    expect(deck).toBeNull();
    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test('reading a deck does not count as using it', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    await getDeck(user.client, { deck_id: atraxa });

    expect(await deckNamesOf(user)).toEqual(['Kinnan', 'Atraxa']);
  });

  test.each<[string, unknown, string | null]>([
    ['a query that is not an object', [], null],
    ['a query with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 'deck-1' }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const { error } = await getDeck((await signUpNewUser()).client, query);

    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });
});

describe('marking a deck used', () => {
  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await markDeckUsed((await signUpNewUser()).client, { deck_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 7 }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const error = await markDeckUsed((await signUpNewUser()).client, request);

    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });
});

describe('renaming a deck', () => {
  test('renames the deck with the trimmed name, counts as using it, and makes no deck change', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    const before = await lastUsedAt(atraxa);

    expect(await writeDeck(user.client, 'rename_deck', { deck_id: atraxa, name: '  Atraxa Superfriends ' })).toBeNull();

    expect(await deckNamesOf(user)).toEqual(['Atraxa Superfriends', 'Kinnan']);
    expect(await lastUsedAt(atraxa) > before).toBe(true);
    expect((await getDeck(user.client, { deck_id: atraxa })).deck).toMatchObject({ priority: 'medium', revision: 0 });
  });

  test('a deck can take the name of another deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    expect(await writeDeck(user.client, 'rename_deck', { deck_id: atraxa, name: 'Kinnan' })).toBeNull();

    expect(await deckNamesOf(user)).toEqual(['Kinnan', 'Kinnan']);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await writeDeck((await signUpNewUser()).client, 'rename_deck', { deck_id: crypto.randomUUID(), name: 'Atraxa' });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test.each<[string, (deckId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no deck ID', () => ({ name: 'Kinnan' }), 'deck_id'],
    ['a request with no name', (deckId) => ({ deck_id: deckId }), 'name'],
    ['an empty name', (deckId) => ({ deck_id: deckId, name: '' }), 'name'],
    ['a name of only spaces', (deckId) => ({ deck_id: deckId, name: '   ' }), 'name'],
    ['a name of 65 characters', (deckId) => ({ deck_id: deckId, name: 'x'.repeat(65) }), 'name'],
    ['an unknown field', (deckId) => ({ deck_id: deckId, name: 'Kinnan', priority: 'high' }), 'priority'],
  ])('%s is refused with invalid_argument, and the deck keeps its name and last use', async (_, request, field) => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const before = await lastUsedAt(atraxa);

    const error = await writeDeck(user.client, 'rename_deck', request(atraxa));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await deckNamesOf(user)).toEqual(['Atraxa']);
    expect(await lastUsedAt(atraxa)).toBe(before);
  });
});

describe('setting the deck priority', () => {
  test.each(['high', 'low', 'medium'] as const)('sets the deck priority to %s, counts as using it, and makes no deck change', async (priority) => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    const before = await lastUsedAt(atraxa);

    expect(await writeDeck(user.client, 'set_deck_priority', { deck_id: atraxa, priority })).toBeNull();

    const [first] = await decksOf(user);
    expect(first).toMatchObject({ deck_id: atraxa, priority });
    expect(await lastUsedAt(atraxa) > before).toBe(true);
    expect((await getDeck(user.client, { deck_id: atraxa })).deck?.revision).toBe(0);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await writeDeck((await signUpNewUser()).client, 'set_deck_priority', {
      deck_id: crypto.randomUUID(),
      priority: 'high',
    });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test.each<[string, (deckId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no deck ID', () => ({ priority: 'high' }), 'deck_id'],
    ['a request with no priority', (deckId) => ({ deck_id: deckId }), 'priority'],
    ['an unknown priority', (deckId) => ({ deck_id: deckId, priority: 'urgent' }), 'priority'],
    ['a priority in capitals', (deckId) => ({ deck_id: deckId, priority: 'High' }), 'priority'],
    ['a priority that is not a string', (deckId) => ({ deck_id: deckId, priority: 1 }), 'priority'],
    ['an unknown field', (deckId) => ({ deck_id: deckId, priority: 'high', name: 'Kinnan' }), 'name'],
  ])('%s is refused with invalid_argument, and the deck keeps its priority and last use', async (_, request, field) => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const before = await lastUsedAt(atraxa);

    const error = await writeDeck(user.client, 'set_deck_priority', request(atraxa));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect((await getDeck(user.client, { deck_id: atraxa })).deck?.priority).toBe('medium');
    expect(await lastUsedAt(atraxa)).toBe(before);
  });
});

describe('deleting a deck', () => {
  test('deletes the deck and leaves the other decks', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    expect(await writeDeck(user.client, 'delete_deck', { deck_id: atraxa })).toBeNull();

    expect(await deckNamesOf(user)).toEqual(['Kinnan']);
    expect((await getDeck(user.client, { deck_id: atraxa })).error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await writeDeck((await signUpNewUser()).client, 'delete_deck', { deck_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 'deck-1' }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument, and no deck is deleted', async (_, request, field) => {
    const user = await signUpNewUser();
    await created(user, 'Atraxa');

    const error = await writeDeck(user.client, 'delete_deck', request);

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await deckNamesOf(user)).toEqual(['Atraxa']);
  });
});

describe('access', () => {
  test("a user cannot list, read, or mark another user's deck", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const atraxa = await created(alice, 'Atraxa');
    await created(alice, 'Kinnan');
    await created(bob, 'Yuriko');
    const before = await lastUsedAt(atraxa);

    expect(await deckNamesOf(bob)).toEqual(['Yuriko']);
    expect((await getDeck(bob.client, { deck_id: atraxa })).error).toMatchObject({ code: 'not_found', field: 'deck_id' });
    expect(await markDeckUsed(bob.client, { deck_id: atraxa })).toMatchObject({ code: 'not_found', field: 'deck_id' });
    expect(await lastUsedAt(atraxa)).toBe(before);
    const { data, error } = await bob.client.from('decks').select('id').eq('user_id', alice.userId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("a user cannot rename, set the priority of, or delete another user's deck", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const atraxa = await created(alice, 'Atraxa');
    const before = await lastUsedAt(atraxa);

    const errors = [
      await writeDeck(bob.client, 'rename_deck', { deck_id: atraxa, name: 'Kinnan' }),
      await writeDeck(bob.client, 'set_deck_priority', { deck_id: atraxa, priority: 'high' }),
      await writeDeck(bob.client, 'delete_deck', { deck_id: atraxa }),
    ];

    for (const error of errors) {
      expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
    }
    expect(await decksOf(alice)).toEqual([expect.objectContaining({ name: 'Atraxa', priority: 'medium' })]);
    expect(await lastUsedAt(atraxa)).toBe(before);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot create, list, read, mark, rename, set the priority of, or delete decks', async (_, client) => {
    const deckId = crypto.randomUUID();
    const calls = [
      client().rpc('create_deck', { request: { name: 'Atraxa' } }),
      client().rpc('list_decks'),
      client().rpc('get_deck', { query: { deck_id: deckId } }),
      client().rpc('mark_deck_used', { request: { deck_id: deckId } }),
      client().rpc('rename_deck', { request: { deck_id: deckId, name: 'Atraxa' } }),
      client().rpc('set_deck_priority', { request: { deck_id: deckId, priority: 'high' } }),
      client().rpc('delete_deck', { request: { deck_id: deckId } }),
    ];

    for (const { error } of await Promise.all(calls)) {
      expect(error?.code).toBe(permissionDenied);
    }
  });

  describe.each([
    ['a signed-in user', true],
    ['an anonymous caller', false],
  ])('direct writes by %s are refused', (_, signedIn) => {
    test('inserting, updating, and deleting decks is refused', async () => {
      const alice = await signUpNewUser();
      const atraxa = await created(alice, 'Atraxa');
      const decks = () => (signedIn ? alice.client : anonymousClient()).from('decks');

      expect((await decks().insert({ user_id: alice.userId, name: 'Direct' })).error?.code).toBe(permissionDenied);
      expect((await decks().update({ name: 'Renamed' }).eq('id', atraxa)).error?.code).toBe(permissionDenied);
      expect((await decks().delete().eq('id', atraxa)).error?.code).toBe(permissionDenied);
      expect(await deckNamesOf(alice)).toEqual(['Atraxa']);
    });
  });
});
