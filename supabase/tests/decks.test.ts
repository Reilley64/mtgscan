import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import { createDeck, deleteDeck, getDeck, listDecks, markDeckUsed, renameDeck, setDeckPriority, type DeckRow } from '../decks';
import { call, failed, refused, replyOf } from './database-calls';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

async function created(user: TestUser, name: string) {
  return (await replyOf(user.client, createDeck, { name })).deck_id;
}

async function decksOf(user: TestUser) {
  return (await replyOf(user.client, listDecks)).items;
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

    const expected: Omit<DeckRow, 'needs_you_count'> = {
      deck_id: deckId,
      name: 'Atraxa',
      priority: 'medium',
      card_count: 0,
      commanders: [],
      last_used_at: expect.any(String),
      evaluation: null,
      revision: 0,
    };
    expect(await decksOf(user)).toEqual([{ ...expected, needs_you_count: 0 }]);
    expect(await replyOf(user.client, getDeck, { deck_id: deckId })).toEqual({
      ...expected,
      evaluation: null,
      created_at: expect.any(String),
      cards: [],
      basic_lands: expect.any(Array),
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

    expect(await call(user.client, createDeck, request as never)).toMatchObject(refused('invalid_argument', field));
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

    expect(await call(user.client, markDeckUsed, { deck_id: atraxa })).toEqual({ status: 'replied', reply: null });

    expect(await deckNamesOf(user)).toEqual(['Atraxa', 'Kinnan']);
    expect(await lastUsedAt(atraxa) > before).toBe(true);
  });

  test.each<[string, unknown, string | null]>([
    ['a query that is not an object', [], null],
    ['an unknown field', { deck_id: crypto.randomUUID() }, 'deck_id'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const result = await call((await signUpNewUser()).client, listDecks, query as never);

    expect(result).toMatchObject(refused('invalid_argument', field));
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
    const result = await call((await signUpNewUser()).client, getDeck, { deck_id: crypto.randomUUID() });

    expect(result).toMatchObject(refused('not_found', 'deck_id'));
  });

  test('reading a deck does not count as using it', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    await replyOf(user.client, getDeck, { deck_id: atraxa });

    expect(await deckNamesOf(user)).toEqual(['Kinnan', 'Atraxa']);
  });

  test.each<[string, unknown, string | null]>([
    ['a query that is not an object', [], null],
    ['a query with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 'deck-1' }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    expect(await call((await signUpNewUser()).client, getDeck, query as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('marking a deck used', () => {
  test('a deck that does not exist is not_found on deck_id', async () => {
    const result = await call((await signUpNewUser()).client, markDeckUsed, { deck_id: crypto.randomUUID() });

    expect(result).toMatchObject(refused('not_found', 'deck_id'));
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 7 }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await call((await signUpNewUser()).client, markDeckUsed, request as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('renaming a deck', () => {
  test('renames the deck with the trimmed name, counts as using it, and makes no deck change', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    const before = await lastUsedAt(atraxa);

    expect(await call(user.client, renameDeck, { deck_id: atraxa, name: '  Atraxa Superfriends ' })).toEqual({ status: 'replied', reply: null });

    expect(await deckNamesOf(user)).toEqual(['Atraxa Superfriends', 'Kinnan']);
    expect(await lastUsedAt(atraxa) > before).toBe(true);
    expect(await replyOf(user.client, getDeck, { deck_id: atraxa })).toMatchObject({ priority: 'medium', revision: 0 });
  });

  test('a deck can take the name of another deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    expect(await call(user.client, renameDeck, { deck_id: atraxa, name: 'Kinnan' })).toEqual({ status: 'replied', reply: null });

    expect(await deckNamesOf(user)).toEqual(['Kinnan', 'Kinnan']);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await call((await signUpNewUser()).client, renameDeck, { deck_id: crypto.randomUUID(), name: 'Atraxa' });

    expect(error).toMatchObject(refused('not_found', 'deck_id'));
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

    const error = await call(user.client, renameDeck, request(atraxa) as never);

    expect(error).toMatchObject(refused('invalid_argument', field));
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

    expect(await call(user.client, setDeckPriority, { deck_id: atraxa, priority })).toEqual({ status: 'replied', reply: null });

    const [first] = await decksOf(user);
    expect(first).toMatchObject({ deck_id: atraxa, priority });
    expect(await lastUsedAt(atraxa) > before).toBe(true);
    expect((await replyOf(user.client, getDeck, { deck_id: atraxa })).revision).toBe(0);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await call((await signUpNewUser()).client, setDeckPriority, {
      deck_id: crypto.randomUUID(),
      priority: 'high',
    });

    expect(error).toMatchObject(refused('not_found', 'deck_id'));
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

    const error = await call(user.client, setDeckPriority, request(atraxa) as never);

    expect(error).toMatchObject(refused('invalid_argument', field));
    expect((await replyOf(user.client, getDeck, { deck_id: atraxa })).priority).toBe('medium');
    expect(await lastUsedAt(atraxa)).toBe(before);
  });
});

describe('deleting a deck', () => {
  test('deletes the deck and leaves the other decks', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    expect(await call(user.client, deleteDeck, { deck_id: atraxa })).toEqual({ status: 'replied', reply: null });

    expect(await deckNamesOf(user)).toEqual(['Kinnan']);
    expect(await call(user.client, getDeck, { deck_id: atraxa })).toMatchObject(refused('not_found', 'deck_id'));
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const error = await call((await signUpNewUser()).client, deleteDeck, { deck_id: crypto.randomUUID() });

    expect(error).toMatchObject(refused('not_found', 'deck_id'));
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no deck ID', {}, 'deck_id'],
    ['a deck ID that is not a UUID', { deck_id: 'deck-1' }, 'deck_id'],
    ['an unknown field', { deck_id: crypto.randomUUID(), name: 'Atraxa' }, 'name'],
  ])('%s is refused with invalid_argument, and no deck is deleted', async (_, request, field) => {
    const user = await signUpNewUser();
    await created(user, 'Atraxa');

    const error = await call(user.client, deleteDeck, request as never);

    expect(error).toMatchObject(refused('invalid_argument', field));
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
    expect(await call(bob.client, getDeck, { deck_id: atraxa })).toMatchObject(refused('not_found', 'deck_id'));
    expect(await call(bob.client, markDeckUsed, { deck_id: atraxa })).toMatchObject(refused('not_found', 'deck_id'));
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
      await call(bob.client, renameDeck, { deck_id: atraxa, name: 'Kinnan' }),
      await call(bob.client, setDeckPriority, { deck_id: atraxa, priority: 'high' }),
      await call(bob.client, deleteDeck, { deck_id: atraxa }),
    ];

    for (const error of errors) {
      expect(error).toMatchObject(refused('not_found', 'deck_id'));
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
      call(client(), createDeck, { name: 'Atraxa' }),
      call(client(), listDecks),
      call(client(), getDeck, { deck_id: deckId }),
      call(client(), markDeckUsed, { deck_id: deckId }),
      call(client(), renameDeck, { deck_id: deckId, name: 'Atraxa' }),
      call(client(), setDeckPriority, { deck_id: deckId, priority: 'high' }),
      call(client(), deleteDeck, { deck_id: deckId }),
    ];

    for (const result of await Promise.all(calls)) {
      expect(result).toMatchObject(failed(permissionDenied));
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
