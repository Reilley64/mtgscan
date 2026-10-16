import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import type { CreatedDeck, DeckSuggestionPage, DeckSuggestionsQuery, DeckSuggestionStatus } from '../decks';
import { basicLand, catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
const reason = 'Cheap removal that also answers an early threat.';
const mountain = basicLand('Mountain').oracle_id;

type Problem = { code: string; message: string; details: string | null };

type SeededSuggestion = {
  deckId: string;
  incomingOracleId: string;
  status?: DeckSuggestionStatus;
  outgoingCopyId?: string;
  outgoingOracleId?: string;
  fromDeckId?: string;
  pairedSuggestionId?: string;
  clientName?: string;
  createdAgo?: string;
};

let counterspell: string;
let blackLotus: string;
let boltOracleId: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  [counterspell, blackLotus, boltOracleId] = await Promise.all(['Counterspell', 'Black Lotus', 'Lightning Bolt'].map(oracleIdOf));
});

async function deckNamed(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function boltInDeck(user: TestUser, deckId: string): Promise<string> {
  const scanned = stack(lightningBolt);
  await committed(user, scanBatch([scanned]));
  const { error } = await user.client.rpc('add_deck_card', {
    request: { deck_id: deckId, copy_id: scanned.copy_ids[0]!, unprotect: false },
  });
  expect(error).toBeNull();
  return scanned.copy_ids[0]!;
}

async function seeded(user: TestUser, suggestion: SeededSuggestion): Promise<string> {
  const [row] = await asDatabaseOwner(
    (database) => database`
      insert into public.deck_suggestions (
        user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, status,
        from_deck_id, paired_suggestion_id, client_id, client_name, created_at, status_changed_at
      )
      values (
        ${user.userId}, ${suggestion.deckId}, ${suggestion.incomingOracleId}, false, ${suggestion.outgoingCopyId ?? null},
        ${suggestion.outgoingOracleId ?? null}, ${reason}, ${suggestion.status ?? 'open'}, ${suggestion.fromDeckId ?? null},
        ${suggestion.pairedSuggestionId ?? null}, gen_random_uuid(), ${suggestion.clientName ?? 'ChatGPT'},
        now() - ${suggestion.createdAgo ?? '0 minutes'}::interval, now() - ${suggestion.createdAgo ?? '0 minutes'}::interval
      )
      returning id
    `,
  );
  return row.id;
}

async function seededMany(user: TestUser, deckId: string, count: number) {
  await asDatabaseOwner(
    (database) => database`
      insert into public.deck_suggestions (user_id, deck_id, incoming_oracle_id, as_commander, reason, client_id, created_at)
      select ${user.userId}, ${deckId}, ${blackLotus}, false, ${reason}, gen_random_uuid(), now() - interval '1 hour'
      from generate_series(1, ${count})
    `,
  );
}

async function seededEvent(user: TestUser, suggestionId: string, kind: 'withdrawn' | 'reason_replaced', clientName: string, createdAgo: string) {
  await asDatabaseOwner(
    (database) => database`
      insert into public.deck_suggestion_events (user_id, suggestion_id, kind, client_id, client_name, created_at)
      values (${user.userId}, ${suggestionId}, ${kind}, gen_random_uuid(), ${clientName}, now() - ${createdAgo}::interval)
    `,
  );
}

async function timesOf(suggestionId: string) {
  const [row] = await asDatabaseOwner(
    (database) => database`
      select to_jsonb(created_at) as created_at, to_jsonb(status_changed_at) as status_changed_at
      from public.deck_suggestions where id = ${suggestionId}
    `,
  );
  return row as { created_at: string; status_changed_at: string };
}

async function listed(user: TestUser, query: DeckSuggestionsQuery = {}): Promise<DeckSuggestionPage> {
  const { data, error } = await user.client.rpc('list_deck_suggestions', { query: query as Json });
  expect(error).toBeNull();
  return data as unknown as DeckSuggestionPage;
}

async function refusalOf(user: TestUser, query: object): Promise<Problem> {
  const { data, error } = await user.client.rpc('list_deck_suggestions', { query: query as Json });
  expect(data).toBeNull();
  return error as Problem;
}

describe('list_deck_suggestions', () => {
  test('lists deck suggestions in every state, newest first', async () => {
    const user = await signUpNewUser();
    const krenko = await deckNamed(user, 'Krenko');
    const goblins = await deckNamed(user, 'Goblins');
    const withdrawn = await seeded(user, { deckId: krenko, incomingOracleId: blackLotus, status: 'withdrawn', createdAgo: '3 hours' });
    const open = await seeded(user, { deckId: goblins, incomingOracleId: counterspell, createdAgo: '1 hour' });
    const stale = await seeded(user, { deckId: krenko, incomingOracleId: counterspell, status: 'stale', createdAgo: '2 hours' });

    const { items, next_cursor } = await listed(user);

    expect(items.map(({ suggestion_id, status }) => [suggestion_id, status])).toEqual([
      [open, 'open'],
      [stale, 'stale'],
      [withdrawn, 'withdrawn'],
    ]);
    expect(next_cursor).toBeNull();
  });

  test('each row has its deck name, card names, reason, status, pair, client name, times, and events', async () => {
    const user = await signUpNewUser();
    const krenko = await deckNamed(user, 'Krenko');
    const goblins = await deckNamed(user, 'Goblins');
    const bolt = await boltInDeck(user, krenko);
    const fromA = await seeded(user, {
      deckId: krenko,
      incomingOracleId: counterspell,
      outgoingCopyId: bolt,
      outgoingOracleId: boltOracleId,
      status: 'withdrawn',
      createdAgo: '1 hour',
    });
    const toB = await seeded(user, {
      deckId: goblins,
      incomingOracleId: boltOracleId,
      outgoingOracleId: mountain,
      fromDeckId: krenko,
      pairedSuggestionId: fromA,
      clientName: 'Claude',
      createdAgo: '1 hour',
    });
    await asDatabaseOwner((database) => database`update public.deck_suggestions set paired_suggestion_id = ${toB} where id = ${fromA}`);
    await seededEvent(user, fromA, 'withdrawn', 'Claude', '10 minutes');
    await seededEvent(user, fromA, 'reason_replaced', 'ChatGPT', '30 minutes');
    const [events] = await asDatabaseOwner(
      (database) => database`
        select jsonb_agg(jsonb_build_object('kind', kind, 'client_name', client_name, 'created_at', created_at) order by created_at) as events
        from public.deck_suggestion_events where suggestion_id = ${fromA}
      `,
    );

    const { items } = await listed(user, { deck_id: krenko });
    const { items: goblinsItems } = await listed(user, { deck_id: goblins });

    expect(items).toEqual([
      {
        suggestion_id: fromA,
        deck_id: krenko,
        deck_name: 'Krenko',
        incoming: { oracle_id: counterspell, name: 'Counterspell', as_commander: false, from_deck_id: null },
        outgoing: { copy_id: bolt, name: 'Lightning Bolt' },
        reason,
        status: 'withdrawn',
        paired_suggestion_id: toB,
        client_name: 'ChatGPT',
        ...(await timesOf(fromA)),
        events: events.events,
      },
    ]);
    expect(items[0]!.events.map(({ kind, client_name }) => [kind, client_name])).toEqual([
      ['reason_replaced', 'ChatGPT'],
      ['withdrawn', 'Claude'],
    ]);
    expect(goblinsItems).toEqual([
      expect.objectContaining({
        suggestion_id: toB,
        deck_name: 'Goblins',
        incoming: { oracle_id: boltOracleId, name: 'Lightning Bolt', as_commander: false, from_deck_id: krenko },
        outgoing: { basic_land_oracle_id: mountain, name: 'Mountain' },
        status: 'open',
        paired_suggestion_id: fromA,
        client_name: 'Claude',
        events: [],
      }),
    ]);
  });

  test('a suggestion with no outgoing card has a null outgoing', async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Krenko');
    await seeded(user, { deckId, incomingOracleId: blackLotus });

    const { items } = await listed(user);

    expect(items).toEqual([expect.objectContaining({ incoming: expect.objectContaining({ name: 'Black Lotus' }), outgoing: null })]);
  });

  test("the deck_id filter lists one deck's suggestions, and another user's deck is not found", async () => {
    const user = await signUpNewUser();
    const krenko = await deckNamed(user, 'Krenko');
    const goblins = await deckNamed(user, 'Goblins');
    const inKrenko = await seeded(user, { deckId: krenko, incomingOracleId: blackLotus });
    await seeded(user, { deckId: goblins, incomingOracleId: blackLotus });
    const othersDeck = await deckNamed(await signUpNewUser(), 'Not yours');

    expect((await listed(user, { deck_id: krenko })).items.map(({ suggestion_id }) => suggestion_id)).toEqual([inKrenko]);
    expect(await refusalOf(user, { deck_id: othersDeck })).toMatchObject({
      code: 'not_found',
      message: 'deck_id is not one of your decks.',
      details: 'deck_id',
    });
  });

  test('the status filter lists the suggestions in one state', async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Krenko');
    const goblins = await deckNamed(user, 'Goblins');
    await seeded(user, { deckId, incomingOracleId: blackLotus });
    const stale = await seeded(user, { deckId, incomingOracleId: counterspell, status: 'stale' });
    await seeded(user, { deckId, incomingOracleId: counterspell, status: 'withdrawn' });
    await seeded(user, { deckId: goblins, incomingOracleId: counterspell, status: 'stale' });

    expect((await listed(user, { deck_id: deckId, status: 'stale' })).items.map(({ suggestion_id }) => suggestion_id)).toEqual([stale]);
    expect((await listed(user, { status: 'stale' })).items).toHaveLength(2);
    expect(await refusalOf(user, { status: 'promoted' })).toMatchObject({
      code: 'invalid_argument',
      message: 'status must be one of: open, withdrawn, stale.',
      details: 'status',
    });
  });

  test('pages have 20 suggestions by default, limit is 1 to 50, and next_cursor reads the next page with no repeats', async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Krenko');
    await seededMany(user, deckId, 52);

    const first = await listed(user);
    const second = await listed(user, { cursor: first.next_cursor });
    const third = await listed(user, { cursor: second.next_cursor });
    const all = await listed(user, { limit: 50 });

    expect([first.items.length, second.items.length, third.items.length]).toEqual([20, 20, 12]);
    expect(third.next_cursor).toBeNull();
    const pagedIds = [...first.items, ...second.items, ...third.items].map(({ suggestion_id }) => suggestion_id);
    expect(new Set(pagedIds).size).toBe(52);
    expect(all.items.map(({ suggestion_id }) => suggestion_id)).toEqual(pagedIds.slice(0, 50));
    expect(await refusalOf(user, { limit: 51 })).toMatchObject({ code: 'invalid_argument', details: 'limit' });
    expect(await refusalOf(user, { limit: 0 })).toMatchObject({ code: 'invalid_argument', details: 'limit' });
  });

  test('a cursor that is not valid or comes from other filters is refused with invalid_cursor', async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Krenko');
    await seededMany(user, deckId, 3);
    const { next_cursor } = await listed(user, { limit: 1 });
    const payload = JSON.parse(Buffer.from(next_cursor!, 'base64').toString());
    const forgedKey = Buffer.from(JSON.stringify({ ...payload, after: ['soon', 'nobody'] })).toString('base64');

    for (const query of [
      { cursor: 'not a cursor' },
      { cursor: next_cursor, deck_id: deckId },
      { cursor: next_cursor, status: 'open' },
      { cursor: forgedKey },
    ]) {
      expect(await refusalOf(user, query)).toMatchObject({ code: 'invalid_cursor', details: 'cursor' });
    }
    expect(await refusalOf(user, { cursor: 7 })).toMatchObject({ code: 'invalid_argument', details: 'cursor' });
  });

  test('an unknown field is refused with invalid_argument', async () => {
    const user = await signUpNewUser();

    expect(await refusalOf(user, { deck: 'Krenko' })).toMatchObject({
      code: 'invalid_argument',
      message: 'deck is not a known field.',
      details: 'deck',
    });
  });

  test("another user's deck suggestions and events are not listed", async () => {
    const alice = await signUpNewUser();
    const bob = await signUpNewUser();
    const alicesDeck = await deckNamed(alice, 'Krenko');
    const alicesSuggestion = await seeded(alice, { deckId: alicesDeck, incomingOracleId: blackLotus });
    await seededEvent(alice, alicesSuggestion, 'reason_replaced', 'ChatGPT', '1 minute');

    expect(await listed(bob)).toEqual({ items: [], next_cursor: null });
    expect((await listed(alice)).items).toEqual([expect.objectContaining({ suggestion_id: alicesSuggestion, events: [expect.any(Object)] })]);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot list deck suggestions', async (_, client) => {
    const { error } = await client().rpc('list_deck_suggestions', { query: {} });

    expect(error?.code).toBe(permissionDenied);
  });
});
