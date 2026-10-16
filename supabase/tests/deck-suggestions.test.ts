import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import type {
  AddDeckCardPreview,
  AddedDeckCard,
  ChangedDeckSuggestion,
  CreatedDeck,
  CreatedDeckSuggestions,
  Deck,
  DeckPriority,
  DeckSuggestionInput,
  DeckSuggestionWarning,
  UpdateDeckSuggestionReasonRequest,
  WithdrawDeckSuggestionRequest,
} from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import {
  anonymousClient,
  asDatabaseOwner,
  asDatabaseRole,
  localStackUrl,
  secretKeyClient,
  signUpNewUser,
  type AppClient,
  type TestUser,
} from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const aiClientOnly = 'Only an AI client can change deck suggestions.';
const krenko = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
const [mountain, island, forest] = ['Mountain', 'Island', 'Forest'].map((name) => basicLand(name).oracle_id) as [
  string,
  string,
  string,
];
const reason = 'Cheap removal that also answers an early threat.';

type Problem = { code: string; message: string; details: string | null };
type DeckSuggestionFunction = 'create_deck_suggestions' | 'withdraw_deck_suggestion' | 'update_deck_suggestion_reason';
type AiClient = { user: TestUser; clientId: string };
type KrenkoDeck = { deckId: string; commander: string; bolt: string };

let oracleIds: Record<string, string>;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  const rows = await asDatabaseOwner(
    (database) => database`
      select id, oracle_id from public.card_printings
      where id in ${database([krenko, lightningBolt, counterspell, blackLotus])}
    `,
  );
  oracleIds = Object.fromEntries(rows.map((row: { id: string; oracle_id: string }) => [row.id, row.oracle_id]));
});

async function appRequest<T>(user: TestUser, name: string, request: object): Promise<T> {
  const { data, error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error).toBeNull();
  return data as T;
}

async function scannedCopies(user: TestUser, cardPrintingId: string, copies = 1): Promise<string[]> {
  const scanned = stack(cardPrintingId, { copies });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids;
}

async function deckNamed(user: TestUser, name: string, priority: DeckPriority = 'medium'): Promise<string> {
  const { deck_id } = await appRequest<CreatedDeck>(user, 'create_deck', { name });
  await appRequest(user, 'set_deck_priority', { deck_id, priority });
  return deck_id;
}

function addedToDeck(user: TestUser, deckId: string, copyId: string) {
  return appRequest<AddedDeckCard>(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
}

async function krenkoDeck(user: TestUser, name = 'Krenko', priority: DeckPriority = 'medium'): Promise<KrenkoDeck> {
  const deckId = await deckNamed(user, name, priority);
  const [commander] = await scannedCopies(user, krenko);
  const [bolt] = await scannedCopies(user, lightningBolt);
  await addedToDeck(user, deckId, commander!);
  await appRequest(user, 'set_deck_commander', { copy_id: commander, commander: true });
  await addedToDeck(user, deckId, bolt!);
  await appRequest(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 98 }] });
  return { deckId, commander: commander!, bolt: bolt! };
}

async function revisionOf(user: TestUser, deckId: string): Promise<number> {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as Deck).revision;
}

async function connectedAiClient(user?: TestUser, clientName = 'ChatGPT'): Promise<AiClient> {
  const clientId = crypto.randomUUID();
  await asDatabaseOwner(
    (database) => database`
      insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
      values (${clientId}, 'dynamic', 'https://chatgpt.com/connector_platform_oauth_redirect', 'authorization_code,refresh_token', ${clientName}, 'public', 'none')
    `,
  );
  return { user: user ?? (await signUpNewUser()), clientId };
}

function aiClientToken({ user, clientId }: AiClient) {
  return {
    sub: user.userId,
    role: 'authenticated',
    aud: ['authenticated', `${localStackUrl}/functions/v1/mcp`],
    client_id: clientId,
  };
}

async function suggestionItem(
  user: TestUser,
  deckId: string,
  incomingOracleId: string,
  changes: Partial<DeckSuggestionInput> = {},
): Promise<DeckSuggestionInput> {
  return {
    ref: crypto.randomUUID().slice(0, 8),
    deck_id: deckId,
    expected_deck_revision: await revisionOf(user, deckId),
    incoming: { oracle_id: incomingOracleId },
    reason,
    ...changes,
  };
}

async function aiClientCall<T>(client: AiClient, name: DeckSuggestionFunction, request: object): Promise<T> {
  const [row] = await asDatabaseRole('authenticated', aiClientToken(client), (database) =>
    database`select ${database.unsafe(`public.${name}`)}(${request}::jsonb) as result`,
  );
  return row.result;
}

function callCreate(client: AiClient, request: object): Promise<CreatedDeckSuggestions> {
  return aiClientCall(client, 'create_deck_suggestions', request);
}

function suggested(client: AiClient, suggestions: DeckSuggestionInput[], idempotencyKey: string = crypto.randomUUID()) {
  return callCreate(client, { idempotency_key: idempotencyKey, suggestions });
}

async function refusalOf(client: AiClient, request: object, name: DeckSuggestionFunction = 'create_deck_suggestions'): Promise<Problem> {
  try {
    await aiClientCall(client, name, request);
  } catch (error) {
    const { errno, message } = error as { errno: string; message: string };
    return errno === 'PGRST' ? (JSON.parse(message) as Problem) : { code: errno, message, details: null };
  }
  throw new Error(`${name} saved the call`);
}

async function storedSuggestions(user: TestUser) {
  const { data, error } = await user.client.from('deck_suggestions').select('*').order('created_at').order('id');
  expect(error).toBeNull();
  return data!;
}

async function storedSuggestion(user: TestUser, suggestionId: string) {
  return (await storedSuggestions(user)).find((suggestion) => suggestion.id === suggestionId);
}

function storedRequests(user: TestUser) {
  return asDatabaseOwner(
    (database) => database`
      select idempotency_key from public.deck_suggestion_requests where user_id = ${user.userId} order by idempotency_key
    `,
  );
}

function codesOf(warnings: DeckSuggestionWarning[]) {
  return warnings.map((warning) => warning.code);
}

async function seededSuggestions(user: TestUser, deckId: string, count: number, createdAgo: string) {
  await asDatabaseOwner(
    (database) => database`
      insert into public.deck_suggestions (user_id, deck_id, incoming_oracle_id, as_commander, reason, client_id, created_at)
      select ${user.userId}, ${deckId}, ${oracleIds[blackLotus]!}, false, ${reason}, gen_random_uuid(), now() - ${createdAgo}::interval
      from generate_series(1, ${count})
    `,
  );
}

async function setCatalogSucceededAt(daysAgo: number) {
  await asDatabaseOwner(
    (database) => database`
      update public.import_snapshots set succeeded_at = now() - ${daysAgo} * interval '1 day' where source = 'catalog'
    `,
  );
}

describe('create_deck_suggestions', () => {
  test('an AI client saves a deck suggestion with its client name, and no deck changes', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const revision = await revisionOf(client.user, deckId);
    const item = await suggestionItem(client.user, deckId, oracleIds[blackLotus]!, { ref: 'lotus' });

    const result = await suggested(client, [item]);

    expect(result).toEqual({
      suggestions: [{ ref: 'lotus', suggestion_id: expect.any(String), paired_suggestion_id: null, warnings: expect.any(Array) }],
      replayed: false,
    });
    expect(await storedSuggestions(client.user)).toEqual([
      expect.objectContaining({
        id: result.suggestions[0]!.suggestion_id,
        deck_id: deckId,
        incoming_oracle_id: oracleIds[blackLotus],
        as_commander: false,
        outgoing_copy_id: null,
        outgoing_oracle_id: null,
        reason,
        status: 'open',
        from_deck_id: null,
        paired_suggestion_id: null,
        client_id: client.clientId,
        client_name: 'ChatGPT',
      }),
    ]);
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test('one call saves 1 to 10 suggestions, all or none', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const incoming = [oracleIds[blackLotus]!, oracleIds[counterspell]!, oracleIds[lightningBolt]!, forest, island];
    const items = await Promise.all(
      [false, true].flatMap((asCommander) =>
        incoming.map((oracleId) =>
          suggestionItem(client.user, deckId, oracleId, { incoming: { oracle_id: oracleId, as_commander: asCommander } }),
        ),
      ),
    );

    expect(await refusalOf(client, { idempotency_key: 'eleven-suggestions', suggestions: [...items, items[0]!] })).toMatchObject({
      code: 'invalid_argument',
      details: 'suggestions',
    });
    expect(await refusalOf(client, { idempotency_key: 'no-suggestions', suggestions: [] })).toMatchObject({
      code: 'invalid_argument',
      details: 'suggestions',
    });
    const { suggestions } = await suggested(client, items);

    expect(suggestions.map((suggestion) => suggestion.ref)).toEqual(items.map((item) => item.ref));
    expect(await storedSuggestions(client.user)).toHaveLength(10);
  });
});

type RejectCase = {
  code: string;
  details: string | object;
  call: (client: AiClient, deck: KrenkoDeck) => Promise<object>;
};

const rejects: [string, RejectCase][] = [
  [
    'a reason shorter than 20 characters',
    {
      code: 'invalid_argument',
      details: 'suggestions[1].reason',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'short-reason',
        suggestions: [
          await suggestionItem(user, deckId, oracleIds[blackLotus]!),
          await suggestionItem(user, deckId, oracleIds[counterspell]!, { reason: 'Too short.' }),
        ],
      }),
    },
  ],
  [
    'an unknown field',
    {
      code: 'invalid_argument',
      details: 'suggestions[1].printing_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'unknown-field',
        suggestions: [
          await suggestionItem(user, deckId, oracleIds[blackLotus]!),
          { ...(await suggestionItem(user, deckId, oracleIds[counterspell]!)), printing_id: lightningBolt },
        ],
      }),
    },
  ],
  [
    'two suggestions with one ref',
    {
      code: 'invalid_argument',
      details: 'suggestions[1].ref',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'repeated-ref',
        suggestions: [
          await suggestionItem(user, deckId, oracleIds[blackLotus]!, { ref: 'same' }),
          await suggestionItem(user, deckId, oracleIds[counterspell]!, { ref: 'same' }),
        ],
      }),
    },
  ],
  [
    'two revisions for one deck',
    {
      code: 'invalid_argument',
      details: 'suggestions[1].expected_deck_revision',
      call: async ({ user }, { deckId }) => {
        const first = await suggestionItem(user, deckId, oracleIds[blackLotus]!);
        const second = await suggestionItem(user, deckId, oracleIds[counterspell]!);
        return { idempotency_key: 'two-revisions', suggestions: [first, { ...second, expected_deck_revision: first.expected_deck_revision - 1 }] };
      },
    },
  ],
  [
    "another user's deck",
    {
      code: 'not_found',
      details: 'suggestions[1].deck_id',
      call: async ({ user }, { deckId }) => {
        const other = await signUpNewUser();
        const othersDeck = await deckNamed(other, 'Not yours');
        return {
          idempotency_key: 'others-deck',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!),
            { ...(await suggestionItem(user, deckId, oracleIds[counterspell]!)), deck_id: othersDeck },
          ],
        };
      },
    },
  ],
  [
    "another user's copy",
    {
      code: 'not_found',
      details: 'suggestions[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const [othersCopy] = await scannedCopies(await signUpNewUser(), lightningBolt);
        return {
          idempotency_key: 'others-copy',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!),
            await suggestionItem(user, deckId, oracleIds[counterspell]!, { outgoing: { copy_id: othersCopy! } }),
          ],
        };
      },
    },
  ],
  [
    'a pair_with ref that is not in the call',
    {
      code: 'not_found',
      details: 'suggestions[1].pair_with',
      call: async ({ user }, { deckId }) => {
        const toDeck = await deckNamed(user, 'Goblins');
        return {
          idempotency_key: 'missing-pair',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!),
            await suggestionItem(user, toDeck, oracleIds[lightningBolt]!, {
              incoming: { oracle_id: oracleIds[lightningBolt]!, from_deck_id: deckId },
              pair_with: 'nobody',
            }),
          ],
        };
      },
    },
  ],
  [
    'an oracle_id that is not a card in the card catalog',
    {
      code: 'invalid_card',
      details: 'suggestions[1].incoming.oracle_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'not-a-card',
        suggestions: [
          await suggestionItem(user, deckId, oracleIds[blackLotus]!),
          await suggestionItem(user, deckId, crypto.randomUUID()),
        ],
      }),
    },
  ],
  [
    'an expected deck revision that is not the deck revision',
    {
      code: 'stale_revision',
      details: { pointer: '/suggestions/1/expected_deck_revision', expected: 3, current: 4 },
      call: async ({ user }, { deckId }) => {
        const toDeck = await deckNamed(user, 'Goblins');
        const stale = await suggestionItem(user, deckId, oracleIds[counterspell]!);
        return {
          idempotency_key: 'stale-revision',
          suggestions: [
            await suggestionItem(user, toDeck, oracleIds[blackLotus]!),
            { ...stale, expected_deck_revision: stale.expected_deck_revision - 1 },
          ],
        };
      },
    },
  ],
  [
    'an outgoing copy that is not in the deck',
    {
      code: 'outgoing_not_in_deck',
      details: 'suggestions[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const [freeCopy] = await scannedCopies(user, counterspell);
        return {
          idempotency_key: 'free-outgoing',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!),
            await suggestionItem(user, deckId, oracleIds[counterspell]!, { outgoing: { copy_id: freeCopy! } }),
          ],
        };
      },
    },
  ],
  [
    'an outgoing basic land card that is not in the deck',
    {
      code: 'outgoing_not_in_deck',
      details: 'suggestions[1].outgoing.basic_land_oracle_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'no-island',
        suggestions: [
          await suggestionItem(user, deckId, oracleIds[blackLotus]!),
          await suggestionItem(user, deckId, oracleIds[counterspell]!, { outgoing: { basic_land_oracle_id: island } }),
        ],
      }),
    },
  ],
  [
    'a from_deck_id that names a deck without the card',
    {
      code: 'pair_incomplete',
      details: 'suggestions[1].incoming.from_deck_id',
      call: async ({ user }, { deckId, bolt }) => {
        const toDeck = await deckNamed(user, 'Goblins');
        return {
          idempotency_key: 'no-card-in-from-deck',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!, { ref: 'from_a', outgoing: { copy_id: bolt } }),
            await suggestionItem(user, toDeck, oracleIds[counterspell]!, {
              incoming: { oracle_id: oracleIds[counterspell]!, from_deck_id: deckId },
              pair_with: 'from_a',
            }),
          ],
        };
      },
    },
  ],
  [
    'a pair whose other suggestion does not take the card out of the deck',
    {
      code: 'pair_incomplete',
      details: 'suggestions[1].pair_with',
      call: async ({ user }, { deckId }) => {
        const toDeck = await deckNamed(user, 'Goblins');
        return {
          idempotency_key: 'pair-keeps-card',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[blackLotus]!, { ref: 'from_a' }),
            await suggestionItem(user, toDeck, oracleIds[lightningBolt]!, {
              incoming: { oracle_id: oracleIds[lightningBolt]!, from_deck_id: deckId },
              pair_with: 'from_a',
            }),
          ],
        };
      },
    },
  ],
  [
    'the same deck, incoming card, as_commander, and outgoing card as an open suggestion',
    {
      code: 'duplicate_open_suggestion',
      details: { pointer: '/suggestions/1', suggestion_id: 'the open suggestion' },
      call: async (client, { deckId, bolt }) => {
        const item = await suggestionItem(client.user, deckId, oracleIds[counterspell]!, { outgoing: { copy_id: bolt } });
        await suggested(client, [item]);
        return {
          idempotency_key: 'duplicate',
          suggestions: [await suggestionItem(client.user, deckId, oracleIds[blackLotus]!), { ...item, reason: `${reason} Again.` }],
        };
      },
    },
  ],
  [
    'more than 30 suggestions in an hour',
    {
      code: 'limit_exceeded',
      details: { pointer: '/suggestions', retry_after_seconds: expect.any(Number) },
      call: async ({ user }, { deckId }) => {
        await seededSuggestions(user, deckId, 29, '59 minutes');
        return {
          idempotency_key: 'hourly-limit',
          suggestions: [
            await suggestionItem(user, deckId, oracleIds[counterspell]!),
            await suggestionItem(user, deckId, oracleIds[lightningBolt]!),
          ],
        };
      },
    },
  ],
  [
    'more than 50 open suggestions in a deck',
    {
      code: 'limit_exceeded',
      details: 'suggestions[1].deck_id',
      call: async ({ user }, { deckId }) => {
        const otherDeck = await deckNamed(user, 'Goblins');
        await seededSuggestions(user, deckId, 49, '2 hours');
        return {
          idempotency_key: 'deck-limit',
          suggestions: [
            await suggestionItem(user, otherDeck, oracleIds[counterspell]!),
            await suggestionItem(user, deckId, oracleIds[counterspell]!),
            await suggestionItem(user, deckId, oracleIds[lightningBolt]!),
          ],
        };
      },
    },
  ],
  [
    'an idempotency key used with different input',
    {
      code: 'idempotency_conflict',
      details: 'idempotency_key',
      call: async (client, { deckId }) => {
        await suggested(client, [await suggestionItem(client.user, deckId, oracleIds[counterspell]!)], 'reused-key');
        return {
          idempotency_key: 'reused-key',
          suggestions: [await suggestionItem(client.user, deckId, oracleIds[blackLotus]!)],
        };
      },
    },
  ],
];

describe('rejects', () => {
  test.each(rejects)('%s is refused, and the call saves nothing', async (_, { code, details, call }) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const request = await call(client, deck);
    const suggestionsBefore = await storedSuggestions(client.user);
    const requestsBefore = await storedRequests(client.user);

    const problem = await refusalOf(client, request);

    expect(problem.code).toBe(code);
    if (typeof details === 'string') {
      expect(problem.details).toBe(details);
    } else {
      const expected = 'suggestion_id' in details ? { ...details, suggestion_id: suggestionsBefore[0]!.id } : details;
      expect(JSON.parse(problem.details!)).toEqual(expected);
    }
    expect(await storedSuggestions(client.user)).toEqual(suggestionsBefore);
    expect(await storedRequests(client.user)).toEqual(requestsBefore);
  });
});

describe('limits', () => {
  test('the hourly limit says when enough suggestions leave the hour', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    await seededSuggestions(client.user, deckId, 1, '50 minutes');
    await seededSuggestions(client.user, deckId, 28, '30 minutes');
    const items = await Promise.all(
      [oracleIds[counterspell]!, oracleIds[lightningBolt]!, forest].map((oracleId) => suggestionItem(client.user, deckId, oracleId)),
    );

    const problem = await refusalOf(client, { idempotency_key: 'three-over-the-hour', suggestions: items });

    expect(problem.code).toBe('limit_exceeded');
    const { retry_after_seconds } = JSON.parse(problem.details!) as { retry_after_seconds: number };
    expect(retry_after_seconds).toBeGreaterThan(29 * 60);
    expect(retry_after_seconds).toBeLessThanOrEqual(30 * 60);
    expect((await suggested(client, items.slice(0, 1))).suggestions).toHaveLength(1);
  });
});

describe('warnings', () => {
  afterEach(() => setCatalogSucceededAt(0));

  test('would_break_validity is the effect that the Add to deck drawer shows for the same card', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const [secondBolt] = await scannedCopies(client.user, lightningBolt);
    const { data: preview } = await client.user.client.rpc('preview_add_deck_card', { query: { copy_id: secondBolt! } });
    const drawerEffect = (preview as unknown as AddDeckCardPreview).items.find((item) => item.deck_id === deckId)!.effect;

    const { suggestions } = await suggested(client, [
      await suggestionItem(client.user, deckId, oracleIds[lightningBolt]!, { ref: 'add' }),
      await suggestionItem(client.user, deckId, oracleIds[lightningBolt]!, {
        ref: 'swap',
        outgoing: { basic_land_oracle_id: mountain },
      }),
    ]);

    expect(drawerEffect).toEqual({ kind: 'would_make_invalid', rules: [{ rule: 'deck_size' }, { rule: 'singleton' }] });
    expect(suggestions[0]!.warnings).toContainEqual({ code: 'would_break_validity', effect: drawerEffect! });
    expect(suggestions[1]!.warnings).toContainEqual({
      code: 'would_break_validity',
      effect: { kind: 'would_make_invalid', rules: [{ rule: 'singleton' }] },
    });
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({ status: 'open' });
  });

  test('a suggestion that adds no violation has no would_break_validity', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await scannedCopies(client.user, lightningBolt);

    const { suggestions } = await suggested(client, [
      await suggestionItem(client.user, deckId, oracleIds[lightningBolt]!, { outgoing: { copy_id: bolt } }),
    ]);

    expect(codesOf(suggestions[0]!.warnings)).toEqual([]);
  });

  test('protected_only when the user owns the card and every free copy is protected', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const [protectedCopy] = await scannedCopies(client.user, counterspell);
    await appRequest(client.user, 'set_copy_protected', { copy_id: protectedCopy, protected: true });

    const { suggestions } = await suggested(client, [await suggestionItem(client.user, deckId, oracleIds[counterspell]!)]);

    expect(codesOf(suggestions[0]!.warnings)).toEqual(['would_break_validity', 'protected_only']);
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({ status: 'open' });
  });

  test('in_other_decks when there is no free copy, copies sit in other decks, and no pair was sent', async () => {
    const client = await connectedAiClient();
    const { deckId: boltDeck } = await krenkoDeck(client.user, 'Krenko', 'high');
    const goblins = await deckNamed(client.user, 'Goblins', 'low');

    const { suggestions } = await suggested(client, [await suggestionItem(client.user, goblins, oracleIds[lightningBolt]!)]);

    expect(suggestions[0]!.warnings).toEqual([
      { code: 'in_other_decks', decks: [{ deck_id: boltDeck, name: 'Krenko', priority: 'high' }] },
    ]);
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({ status: 'open' });
  });

  test('not_owned when the user owns no copy of the card', async () => {
    const client = await connectedAiClient();
    const goblins = await deckNamed(client.user, 'Goblins');

    const { suggestions } = await suggested(client, [await suggestionItem(client.user, goblins, oracleIds[blackLotus]!)]);

    expect(suggestions[0]!.warnings).toEqual([{ code: 'not_owned' }]);
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({ status: 'open' });
  });

  test('replaces_commander when the outgoing copy is a commander, and as_commander then defaults to true', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    await scannedCopies(client.user, counterspell);

    const { suggestions } = await suggested(client, [
      await suggestionItem(client.user, deckId, oracleIds[counterspell]!, { ref: 'default', outgoing: { copy_id: commander } }),
      await suggestionItem(client.user, deckId, oracleIds[counterspell]!, {
        ref: 'main',
        incoming: { oracle_id: oracleIds[counterspell]!, as_commander: false },
        outgoing: { copy_id: commander },
      }),
    ]);

    expect(codesOf(suggestions[0]!.warnings)).toContain('replaces_commander');
    expect(codesOf(suggestions[1]!.warnings)).toContain('replaces_commander');
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({
      as_commander: true,
      outgoing_copy_id: commander,
      outgoing_oracle_id: expect.any(String),
    });
    expect(await storedSuggestion(client.user, suggestions[1]!.suggestion_id)).toMatchObject({ as_commander: false });
  });

  test('rules_stale when the rules data of the deck is stale', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    await scannedCopies(client.user, lightningBolt);
    const item = await suggestionItem(client.user, deckId, oracleIds[lightningBolt]!, { outgoing: { basic_land_oracle_id: mountain } });

    expect(codesOf((await suggested(client, [item])).suggestions[0]!.warnings)).not.toContain('rules_stale');
    await setCatalogSucceededAt(8);
    const { suggestions } = await suggested(client, [{ ...item, incoming: { oracle_id: item.incoming.oracle_id, as_commander: true } }]);

    expect(codesOf(suggestions[0]!.warnings)).toContain('rules_stale');
    expect(await storedSuggestion(client.user, suggestions[0]!.suggestion_id)).toMatchObject({ status: 'open' });
  });

  test('a basic land card is never protected_only, in_other_decks, or not_owned', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const goblins = await deckNamed(client.user, 'Goblins');

    const { suggestions } = await suggested(client, [
      await suggestionItem(client.user, deckId, forest, { ref: 'forest' }),
      await suggestionItem(client.user, goblins, mountain, { ref: 'mountain' }),
    ]);

    expect(suggestions.map(({ warnings }) => codesOf(warnings))).toEqual([['would_break_validity'], []]);
  });
});

describe('pairs', () => {
  async function pairMove(fromPriority: DeckPriority, toPriority: DeckPriority) {
    const client = await connectedAiClient();
    const fromDeck = await krenkoDeck(client.user, 'Krenko', fromPriority);
    const toDeck = await deckNamed(client.user, 'Goblins', toPriority);
    const result = await suggested(client, [
      await suggestionItem(client.user, toDeck, oracleIds[lightningBolt]!, {
        ref: 'to_b',
        incoming: { oracle_id: oracleIds[lightningBolt]!, from_deck_id: fromDeck.deckId },
        pair_with: 'from_a',
      }),
      await suggestionItem(client.user, fromDeck.deckId, oracleIds[blackLotus]!, {
        ref: 'from_a',
        outgoing: { copy_id: fromDeck.bolt },
      }),
    ]);
    return { client, fromDeck, toDeck, result };
  }

  test('a pair saves two suggestions linked both ways', async () => {
    const { client, fromDeck, toDeck, result } = await pairMove('medium', 'medium');
    const [toB, fromA] = result.suggestions as [CreatedDeckSuggestions['suggestions'][number], CreatedDeckSuggestions['suggestions'][number]];

    expect(toB.paired_suggestion_id).toBe(fromA.suggestion_id);
    expect(fromA.paired_suggestion_id).toBe(toB.suggestion_id);
    expect(codesOf(toB.warnings)).toEqual([]);
    expect(await storedSuggestion(client.user, toB.suggestion_id)).toMatchObject({
      deck_id: toDeck,
      from_deck_id: fromDeck.deckId,
      paired_suggestion_id: fromA.suggestion_id,
    });
    expect(await storedSuggestion(client.user, fromA.suggestion_id)).toMatchObject({
      deck_id: fromDeck.deckId,
      outgoing_copy_id: fromDeck.bolt,
      from_deck_id: null,
      paired_suggestion_id: toB.suggestion_id,
    });
  });

  test.each<[DeckPriority, DeckPriority, boolean]>([
    ['high', 'low', true],
    ['high', 'medium', true],
    ['medium', 'low', true],
    ['medium', 'medium', false],
    ['low', 'high', false],
    ['medium', 'high', false],
  ])('a move from a %s to a %s priority deck warns against_deck_priority: %p', async (fromPriority, toPriority, warned) => {
    const { result } = await pairMove(fromPriority, toPriority);

    const expected: DeckSuggestionWarning = { code: 'against_deck_priority', from_deck_priority: fromPriority, deck_priority: toPriority };
    if (warned) {
      expect(result.suggestions[0]!.warnings).toEqual([expected]);
    } else {
      expect(result.suggestions[0]!.warnings).toEqual([]);
    }
    expect(codesOf(result.suggestions[1]!.warnings)).not.toContain('against_deck_priority');
  });

  test('deleting a deck deletes its suggestions and leaves the pair partner open', async () => {
    const first = await pairMove('medium', 'medium');
    const second = await pairMove('medium', 'medium');
    const [, firstFromA] = first.result.suggestions;
    const [secondToB] = second.result.suggestions;

    await appRequest(first.client.user, 'delete_deck', { deck_id: first.toDeck });
    await appRequest(second.client.user, 'delete_deck', { deck_id: second.fromDeck.deckId });

    expect(await storedSuggestions(first.client.user)).toEqual([
      expect.objectContaining({ id: firstFromA!.suggestion_id, status: 'open', paired_suggestion_id: null }),
    ]);
    expect(await storedSuggestions(second.client.user)).toEqual([
      expect.objectContaining({ id: secondToB!.suggestion_id, status: 'open', paired_suggestion_id: null, from_deck_id: null }),
    ]);
  });
});

describe('idempotency', () => {
  test('a repeat with the same input returns the first result with replayed: true and saves nothing again', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const request = { idempotency_key: 'retried-call', suggestions: [await suggestionItem(client.user, deckId, oracleIds[blackLotus]!)] };
    const first = await callCreate(client, request);
    const saved = await storedSuggestions(client.user);

    const repeat = await callCreate(client, request);

    expect(repeat).toEqual({ ...first, replayed: true });
    expect(await storedSuggestions(client.user)).toEqual(saved);
  });

  test('idempotency keys are per user', async () => {
    const alice = await connectedAiClient();
    const bob = await connectedAiClient();
    const alicesDeck = (await krenkoDeck(alice.user)).deckId;
    const bobsDeck = (await krenkoDeck(bob.user)).deckId;

    await suggested(alice, [await suggestionItem(alice.user, alicesDeck, oracleIds[blackLotus]!)], 'shared-key');
    const bobs = await suggested(bob, [await suggestionItem(bob.user, bobsDeck, oracleIds[blackLotus]!)], 'shared-key');

    expect(bobs.replayed).toBe(false);
    expect(await storedSuggestions(bob.user)).toEqual([expect.objectContaining({ id: bobs.suggestions[0]!.suggestion_id })]);
  });

  test('keys are kept 24 hours, and older keys are deleted', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    await suggested(client, [await suggestionItem(client.user, deckId, oracleIds[blackLotus]!)], 'old-idempotency-key');
    const age = (interval: string) =>
      asDatabaseOwner(
        (database) => database`
          update public.deck_suggestion_requests set created_at = now() - ${interval}::interval
          where user_id = ${client.user.userId} and idempotency_key = 'old-idempotency-key'
        `,
      );

    await age('23 hours');
    expect(await refusalOf(client, { idempotency_key: 'old-idempotency-key', suggestions: [await suggestionItem(client.user, deckId, oracleIds[counterspell]!)] })).toMatchObject({
      code: 'idempotency_conflict',
    });
    await age('25 hours');
    const other = await connectedAiClient();
    await suggested(other, [await suggestionItem(other.user, await deckNamed(other.user, 'Other'), forest)]);

    expect(await storedRequests(client.user)).toEqual([]);
    const reused = await suggested(client, [await suggestionItem(client.user, deckId, oracleIds[counterspell]!)], 'old-idempotency-key');
    expect(reused.replayed).toBe(false);
  });
});

describe('withdrawing a deck suggestion and replacing its reason', () => {
  const newReason = 'Counterspell answers the combo pieces this deck fears most.';
  const suggestionChanges: [DeckSuggestionFunction, object][] = [
    ['withdraw_deck_suggestion', {}],
    ['update_deck_suggestion_reason', { reason: newReason }],
  ];

  async function openSuggestion(client: AiClient, changes: Partial<DeckSuggestionInput> = {}) {
    const deck = await krenkoDeck(client.user);
    const { suggestions } = await suggested(client, [await suggestionItem(client.user, deck.deckId, oracleIds[counterspell]!, changes)]);
    return { ...deck, suggestionId: suggestions[0]!.suggestion_id };
  }

  async function storedEvents(user: TestUser) {
    const { data, error } = await user.client.from('deck_suggestion_events').select('*').order('created_at').order('id');
    expect(error).toBeNull();
    return data!;
  }

  function withdrawn(client: AiClient, suggestionId: string) {
    const request: WithdrawDeckSuggestionRequest = { suggestion_id: suggestionId };
    return aiClientCall<ChangedDeckSuggestion>(client, 'withdraw_deck_suggestion', request);
  }

  function reasonReplaced(client: AiClient, suggestionId: string, replacement: string) {
    const request: UpdateDeckSuggestionReasonRequest = { suggestion_id: suggestionId, reason: replacement };
    return aiClientCall<ChangedDeckSuggestion>(client, 'update_deck_suggestion_reason', request);
  }

  test('a second AI client withdraws an open suggestion, and one deck suggestion event records it', async () => {
    const maker = await connectedAiClient();
    const { deckId, suggestionId } = await openSuggestion(maker);
    const other = await connectedAiClient(maker.user, 'Claude');
    const revision = await revisionOf(maker.user, deckId);
    const before = (await storedSuggestion(maker.user, suggestionId))!;

    expect(await withdrawn(other, suggestionId)).toEqual({ suggestion_id: suggestionId, changed: true });

    const after = (await storedSuggestion(maker.user, suggestionId))!;
    expect(after).toMatchObject({ status: 'withdrawn', reason, client_id: maker.clientId, client_name: 'ChatGPT' });
    expect(new Date(after.status_changed_at).getTime()).toBeGreaterThan(new Date(before.status_changed_at).getTime());
    expect(await storedEvents(maker.user)).toEqual([
      {
        id: expect.any(String),
        user_id: maker.user.userId,
        suggestion_id: suggestionId,
        kind: 'withdrawn',
        client_id: other.clientId,
        client_name: 'Claude',
        created_at: expect.any(String),
      },
    ]);
    expect(await revisionOf(maker.user, deckId)).toBe(revision);
  });

  test('a second AI client replaces the reason of an open suggestion, one deck suggestion event records it, and no old reason text is kept', async () => {
    const maker = await connectedAiClient();
    const { suggestionId } = await openSuggestion(maker);
    const other = await connectedAiClient(maker.user, 'Claude');
    const before = (await storedSuggestion(maker.user, suggestionId))!;

    expect(await reasonReplaced(other, suggestionId, newReason)).toEqual({ suggestion_id: suggestionId, changed: true });

    expect(await storedSuggestion(maker.user, suggestionId)).toEqual({ ...before, reason: newReason });
    const events = await storedEvents(maker.user);
    expect(events).toEqual([
      {
        id: expect.any(String),
        user_id: maker.user.userId,
        suggestion_id: suggestionId,
        kind: 'reason_replaced',
        client_id: other.clientId,
        client_name: 'Claude',
        created_at: expect.any(String),
      },
    ]);
    expect(JSON.stringify([await storedSuggestions(maker.user), events])).not.toContain(reason);
  });

  test('withdrawing a withdrawn suggestion succeeds, changes nothing, and writes no deck suggestion event', async () => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);
    await withdrawn(client, suggestionId);
    const suggestion = await storedSuggestion(client.user, suggestionId);
    const events = await storedEvents(client.user);

    expect(await withdrawn(client, suggestionId)).toEqual({ suggestion_id: suggestionId, changed: false });

    expect(await storedSuggestion(client.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(client.user)).toEqual(events);
  });

  test('setting the reason a suggestion already has succeeds, changes nothing, and writes no deck suggestion event', async () => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);
    const suggestion = await storedSuggestion(client.user, suggestionId);

    expect(await reasonReplaced(client, suggestionId, reason)).toEqual({ suggestion_id: suggestionId, changed: false });

    expect(await storedSuggestion(client.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(client.user)).toEqual([]);
  });

  test('a stale suggestion is not_open, and neither call changes it', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const { suggestions } = await suggested(client, [
      await suggestionItem(client.user, deckId, oracleIds[counterspell]!, { outgoing: { copy_id: bolt } }),
    ]);
    const suggestionId = suggestions[0]!.suggestion_id;
    await appRequest(client.user, 'remove_deck_card', { copy_id: bolt });
    const suggestion = await storedSuggestion(client.user, suggestionId);
    const notOpen = {
      code: 'not_open',
      message: 'The deck suggestion is stale. Only an open deck suggestion can change.',
      details: 'suggestion_id',
    };

    expect(suggestion).toMatchObject({ status: 'stale' });
    expect(await refusalOf(client, { suggestion_id: suggestionId }, 'withdraw_deck_suggestion')).toMatchObject(notOpen);
    expect(await refusalOf(client, { suggestion_id: suggestionId, reason: newReason }, 'update_deck_suggestion_reason')).toMatchObject(notOpen);
    expect(await storedSuggestion(client.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(client.user)).toEqual([]);
  });

  test('withdrawn is final: replacing the reason of a withdrawn suggestion is not_open', async () => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);
    await withdrawn(client, suggestionId);
    const suggestion = await storedSuggestion(client.user, suggestionId);

    expect(await refusalOf(client, { suggestion_id: suggestionId, reason: newReason }, 'update_deck_suggestion_reason')).toMatchObject({
      code: 'not_open',
      message: 'The deck suggestion is withdrawn. Only an open deck suggestion can change.',
      details: 'suggestion_id',
    });
    expect(await storedSuggestion(client.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(client.user)).toHaveLength(1);
  });

  test.each([
    ['20 characters', 20],
    ['600 characters', 600],
  ])('a reason of %s is saved', async (_, length) => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);
    const replacement = 'x'.repeat(length);

    expect(await reasonReplaced(client, suggestionId, replacement)).toEqual({ suggestion_id: suggestionId, changed: true });
    expect(await storedSuggestion(client.user, suggestionId)).toMatchObject({ reason: replacement });
  });

  test.each([
    ['19 characters', 19],
    ['601 characters', 601],
  ])('a reason of %s is refused with invalid_argument on reason', async (_, length) => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);

    expect(await refusalOf(client, { suggestion_id: suggestionId, reason: 'x'.repeat(length) }, 'update_deck_suggestion_reason')).toMatchObject({
      code: 'invalid_argument',
      message: 'reason must be a string of 20 to 600 characters.',
      details: 'reason',
    });
    expect(await storedSuggestion(client.user, suggestionId)).toMatchObject({ reason });
    expect(await storedEvents(client.user)).toEqual([]);
  });

  test.each(suggestionChanges)("%s refuses another user's deck suggestion with not_found", async (name, rest) => {
    const owner = await connectedAiClient();
    const { suggestionId } = await openSuggestion(owner);
    const stranger = await connectedAiClient();
    const suggestion = await storedSuggestion(owner.user, suggestionId);

    for (const missing of [suggestionId, crypto.randomUUID()]) {
      expect(await refusalOf(stranger, { suggestion_id: missing, ...rest }, name)).toMatchObject({
        code: 'not_found',
        message: 'suggestion_id is not one of your deck suggestions.',
        details: 'suggestion_id',
      });
    }
    expect(await storedSuggestion(owner.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(owner.user)).toEqual([]);
  });

  test.each(suggestionChanges)("%s refuses the app's token, an anonymous caller, and the secret key", async (name, rest) => {
    const client = await connectedAiClient();
    const { suggestionId } = await openSuggestion(client);
    const suggestion = await storedSuggestion(client.user, suggestionId);
    const request = { suggestion_id: suggestionId, ...rest } as Json;

    const appCall = await client.user.client.rpc(name, { request });
    expect(appCall.error).toMatchObject({ code: permissionDenied, message: aiClientOnly });
    for (const other of [anonymousClient(), secretKeyClient()]) {
      expect((await other.rpc(name, { request })).error?.code).toBe(permissionDenied);
    }
    expect(await storedSuggestion(client.user, suggestionId)).toEqual(suggestion);
    expect(await storedEvents(client.user)).toEqual([]);
  });

  test("the app's token is refused when the call would change nothing", async () => {
    const client = await connectedAiClient();
    const { suggestionId: withdrawnId } = await openSuggestion(client);
    const { suggestionId: openId } = await openSuggestion(client);
    await withdrawn(client, withdrawnId);
    const app = client.user.client;

    const repeats = [
      await app.rpc('withdraw_deck_suggestion', { request: { suggestion_id: withdrawnId } }),
      await app.rpc('update_deck_suggestion_reason', { request: { suggestion_id: openId, reason } }),
    ];

    expect(repeats.map(({ error }) => error)).toEqual([
      expect.objectContaining({ code: permissionDenied, message: aiClientOnly }),
      expect.objectContaining({ code: permissionDenied, message: aiClientOnly }),
    ]);
  });
});

describe('the stale rule', () => {
  async function openSuggestion(client: AiClient, deckId: string, changes: Partial<DeckSuggestionInput>) {
    const { suggestions } = await suggested(client, [await suggestionItem(client.user, deckId, oracleIds[blackLotus]!, changes)]);
    return suggestions[0]!.suggestion_id;
  }

  async function statusOf(client: AiClient, suggestionId: string) {
    return (await storedSuggestion(client.user, suggestionId))!.status;
  }

  test('removing the outgoing copy from the deck makes the suggestion stale, and stale is final', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const swap = await openSuggestion(client, deckId, { outgoing: { copy_id: bolt } });
    const addition = await openSuggestion(client, deckId, {});

    await appRequest(client.user, 'remove_deck_card', { copy_id: bolt });
    expect(await statusOf(client, swap)).toBe('stale');
    expect(await statusOf(client, addition)).toBe('open');
    const staleAt = (await storedSuggestion(client.user, swap))!.status_changed_at;

    await addedToDeck(client.user, deckId, bolt);
    expect(await storedSuggestion(client.user, swap)).toMatchObject({ status: 'stale', status_changed_at: staleAt });
  });

  test('moving a commander to the main deck keeps it in the deck, so the suggestion stays open', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const swap = await openSuggestion(client, deckId, { outgoing: { copy_id: commander } });

    await appRequest(client.user, 'set_deck_commander', { copy_id: commander, commander: false });
    expect(await statusOf(client, swap)).toBe('open');

    await appRequest(client.user, 'remove_deck_card', { copy_id: commander });
    expect(await statusOf(client, swap)).toBe('stale');
  });

  test('setting basic lands makes the suggestion stale only when the deck has none left of its outgoing basic land card', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const swap = await openSuggestion(client, deckId, { outgoing: { basic_land_oracle_id: mountain } });

    await appRequest(client.user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 1 }] });
    expect(await statusOf(client, swap)).toBe('open');

    await appRequest(client.user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 0 }] });
    expect(await statusOf(client, swap)).toBe('stale');
  });

  test('a revert that takes the outgoing copy out of the deck makes the suggestion stale', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const [counter] = await scannedCopies(client.user, counterspell);
    const { revision } = await addedToDeck(client.user, deckId, counter!);
    const swap = await openSuggestion(client, deckId, { outgoing: { copy_id: counter! } });
    const { data } = await client.user.client.rpc('list_deck_changes', { query: { deck_id: deckId } });
    const addition = (data as unknown as { items: { deck_change_id: string; revision: number }[] }).items.find(
      (change) => change.revision === revision,
    )!;

    await appRequest(client.user, 'revert_deck_changes', {
      deck_id: deckId,
      deck_change_id: addition.deck_change_id,
      expected_revision: revision,
      unprotect: false,
    });

    expect(await statusOf(client, swap)).toBe('stale');
  });

  test('deleting the outgoing copy makes the suggestion stale', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const swap = await openSuggestion(client, deckId, { outgoing: { copy_id: bolt } });

    await appRequest(client.user, 'delete_copy', { copy_id: bolt });

    expect(await storedSuggestion(client.user, swap)).toMatchObject({ status: 'stale', outgoing_copy_id: bolt });
  });

  test('a withdrawn suggestion stays withdrawn when its outgoing copy leaves the deck', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const swap = await openSuggestion(client, deckId, { outgoing: { copy_id: bolt } });
    await asDatabaseOwner((database) => database`update public.deck_suggestions set status = 'withdrawn' where id = ${swap}`);

    await appRequest(client.user, 'remove_deck_card', { copy_id: bolt });

    expect(await statusOf(client, swap)).toBe('withdrawn');
  });
});

describe('access', () => {
  test("the app's token is refused", async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Goblins');

    const { error } = await user.client.rpc('create_deck_suggestions', {
      request: { idempotency_key: 'app-token', suggestions: [await suggestionItem(user, deckId, forest)] } as unknown as Json,
    });

    expect(error).toMatchObject({ code: permissionDenied, message: aiClientOnly });
    expect(await storedSuggestions(user)).toEqual([]);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot create deck suggestions', async (_, client) => {
    const { error } = await client().rpc('create_deck_suggestions', { request: {} });

    expect(error?.code).toBe(permissionDenied);
  });

  test("another user's deck suggestions and events are unreadable, and no app role reads idempotency keys", async () => {
    const alice = await connectedAiClient();
    const bob = await signUpNewUser();
    const { deckId } = await krenkoDeck(alice.user);
    const { suggestions } = await suggested(alice, [await suggestionItem(alice.user, deckId, forest)], 'alices-key');
    await asDatabaseOwner(
      (database) => database`
        insert into public.deck_suggestion_events (user_id, suggestion_id, kind, client_id, client_name)
        values (${alice.user.userId}, ${suggestions[0]!.suggestion_id}, 'reason_replaced', ${alice.clientId}, 'ChatGPT')
      `,
    );

    for (const table of ['deck_suggestions', 'deck_suggestion_events'] as const) {
      expect((await alice.user.client.from(table).select('user_id')).data).toEqual([{ user_id: alice.user.userId }]);
      expect((await bob.client.from(table).select('user_id')).data).toEqual([]);
    }
    for (const client of [alice.user.client, secretKeyClient()]) {
      expect((await client.from('deck_suggestion_requests').select('user_id')).error?.code).toBe(permissionDenied);
    }
    expect(await storedRequests(alice.user)).toEqual([{ idempotency_key: 'alices-key' }]);
  });

  test('direct writes are refused', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const { suggestions } = await suggested(client, [await suggestionItem(client.user, deckId, forest)]);
    const suggestionId = suggestions[0]!.suggestion_id;
    const tables = client.user.client;

    const writes = [
      await tables.from('deck_suggestions').insert({
        user_id: client.user.userId,
        deck_id: deckId,
        incoming_oracle_id: forest,
        as_commander: false,
        reason,
        client_id: client.clientId,
      }),
      await tables.from('deck_suggestions').update({ status: 'withdrawn' }).eq('id', suggestionId),
      await tables.from('deck_suggestions').delete().eq('id', suggestionId),
      await tables.from('deck_suggestion_events').insert({
        user_id: client.user.userId,
        suggestion_id: suggestionId,
        kind: 'withdrawn',
        client_id: client.clientId,
      }),
      await tables.from('deck_suggestion_requests').delete().eq('user_id', client.user.userId),
    ];

    expect(writes.map(({ error }) => error?.code)).toEqual(Array(writes.length).fill(permissionDenied));
    expect(await storedSuggestion(client.user, suggestionId)).toMatchObject({ status: 'open' });
  });
});
