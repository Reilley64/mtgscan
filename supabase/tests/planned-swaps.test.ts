import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import type { AddDeckCardPreview, Deck, DeckChangePage } from '../decks';
import type { CreatedPlannedSwaps, PlannedSwapInput } from '../planned-swaps';
import { aiClientCall, aiClientRefusal, connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { setCatalogSucceededAt } from './deck-evaluation-seeds';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import {
  appRead,
  appRequest,
  blackLotus,
  codesOf,
  copyOf,
  counterspell,
  deckNamed,
  krenko,
  krenkoDeck,
  lightningBolt,
  listed,
  onePlannedSwap,
  planned,
  plannedSwapIds,
  plannedSwapItem,
  reason,
  revisionOf,
  scannedCopies,
  scannedCopy,
  twoItems,
  type KrenkoDeck,
} from './planned-swap-seeds';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const aiClientOnly = 'Only an AI client can call this function.';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

describe('create_planned_swaps', () => {
  test('an AI client saves a planned swap that holds a free copy, with its reason, and no deck changes', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const revision = await revisionOf(client.user, deckId);

    const result = await planned(client, [
      await plannedSwapItem(client.user, deckId, newBolt, { ref: 'bolt', outgoing: { copy_id: bolt } }),
    ]);

    expect(result).toEqual({
      planned_swaps: [{ ref: 'bolt', planned_swap_id: expect.any(String), warnings: [] }],
      replayed: false,
    });
    expect((await listed(client.user)).items).toEqual([
      expect.objectContaining({
        planned_swap_id: result.planned_swaps[0]!.planned_swap_id,
        deck_id: deckId,
        deck_name: 'Krenko',
        incoming: expect.objectContaining({ kind: 'copy', copy_id: newBolt, name: 'Lightning Bolt' }),
        outgoing: expect.objectContaining({ kind: 'copy', copy_id: bolt, name: 'Lightning Bolt' }),
        as_commander: false,
        reason,
        status: 'open',
        close_note: null,
      }),
    ]);
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect(await copyOf(client.user, newBolt)).toMatchObject({ free: false, deck: null });
  });

  test('one call saves 1 to 10 planned swaps, all or none', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const revision = await revisionOf(client.user, deckId);
    const shapes = [counterspell, blackLotus].flatMap((printingId) =>
      [undefined, bolt, commander].flatMap((outgoing) => [false, true].map((asCommander) => ({ printingId, outgoing, asCommander }))),
    );
    const items: PlannedSwapInput[] = [];
    for (const [index, { printingId, outgoing, asCommander }] of shapes.slice(0, 11).entries()) {
      items.push({
        ref: `swap${index}`,
        deck_id: deckId,
        expected_deck_revision: revision,
        incoming: { copy_id: await scannedCopy(client.user, printingId), as_commander: asCommander },
        ...(outgoing ? { outgoing: { copy_id: outgoing } } : {}),
        reason,
      });
    }

    expect(await aiClientRefusal(client, 'create_planned_swaps', { idempotency_key: 'eleven-swaps', planned_swaps: items })).toMatchObject({
      code: 'invalid_argument',
      details: 'planned_swaps',
    });
    expect(await aiClientRefusal(client, 'create_planned_swaps', { idempotency_key: 'no-swaps', planned_swaps: [] })).toMatchObject({
      code: 'invalid_argument',
      details: 'planned_swaps',
    });
    const { planned_swaps } = await planned(client, items.slice(0, 10));

    expect(planned_swaps.map((swap) => swap.ref)).toEqual(items.slice(0, 10).map((item) => item.ref));
    expect(await plannedSwapIds(client.user)).toHaveLength(10);
  });
});

type RefusalCase = {
  code: string;
  details: string | object;
  call: (client: ClaimedAiClient, deck: KrenkoDeck) => Promise<object>;
};

function swapItemOf(user: TestUser, deckId: string) {
  return async (index: number) => plannedSwapItem(user, deckId, await scannedCopy(user, [blackLotus, counterspell][index]!));
}

const refusals: [string, RefusalCase][] = [
  [
    'a reason shorter than 20 characters',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1].reason',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'short-reason',
        planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, reason: 'Too short.' })),
      }),
    },
  ],
  [
    'an unknown field',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1].incoming.oracle_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'unknown-field',
        planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, incoming: { ...item.incoming, oracle_id: krenko } as unknown as PlannedSwapInput['incoming'] })),
      }),
    },
  ],
  [
    'two planned swaps with one ref',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1].ref',
      call: async ({ user }, { deckId }) => {
        const [first, second] = await twoItems(swapItemOf(user, deckId), (item) => item);
        return { idempotency_key: 'repeated-ref', planned_swaps: [first, { ...second!, ref: first!.ref }] };
      },
    },
  ],
  [
    'two planned swaps with one copy',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1].incoming.copy_id',
      call: async ({ user }, { deckId, bolt }) => {
        const [first, second] = await twoItems(swapItemOf(user, deckId), (item) => item);
        return {
          idempotency_key: 'repeated-copy',
          planned_swaps: [first, { ...second!, incoming: first!.incoming, outgoing: { copy_id: bolt } }],
        };
      },
    },
  ],
  [
    'two revisions for one deck',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1].expected_deck_revision',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'two-revisions',
        planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, expected_deck_revision: item.expected_deck_revision - 1 })),
      }),
    },
  ],
  [
    'two planned swaps with the same incoming card, as_commander, and outgoing card',
    {
      code: 'invalid_argument',
      details: 'planned_swaps[1]',
      call: async ({ user }, { deckId }) => {
        const [first] = await twoItems(swapItemOf(user, deckId), (item) => item);
        const second = await plannedSwapItem(user, deckId, await scannedCopy(user, blackLotus));
        return { idempotency_key: 'repeated-swap', planned_swaps: [first, second] };
      },
    },
  ],
  [
    "another user's deck",
    {
      code: 'not_found',
      details: 'planned_swaps[1].deck_id',
      call: async ({ user }, { deckId }) => {
        const othersDeck = await deckNamed(await signUpNewUser(), 'Not yours');
        return { idempotency_key: 'others-deck', planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, deck_id: othersDeck })) };
      },
    },
  ],
  [
    "another user's copy as the incoming card",
    {
      code: 'not_found',
      details: 'planned_swaps[1].incoming.copy_id',
      call: async ({ user }, { deckId }) => {
        const othersCopy = await scannedCopy(await signUpNewUser(), counterspell);
        return {
          idempotency_key: 'others-incoming',
          planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, incoming: { copy_id: othersCopy } })),
        };
      },
    },
  ],
  [
    "another user's copy as the outgoing card",
    {
      code: 'not_found',
      details: 'planned_swaps[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const othersCopy = await scannedCopy(await signUpNewUser(), lightningBolt);
        return {
          idempotency_key: 'others-outgoing',
          planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, outgoing: { copy_id: othersCopy } })),
        };
      },
    },
  ],
  [
    'an expected deck revision that is not the deck revision',
    {
      code: 'stale_revision',
      details: { pointer: '/planned_swaps/1/expected_deck_revision', expected: 3, current: 4 },
      call: async ({ user }, { deckId }) => {
        const goblins = await deckNamed(user, 'Goblins');
        const first = await plannedSwapItem(user, goblins, await scannedCopy(user, blackLotus));
        const stale = await plannedSwapItem(user, deckId, await scannedCopy(user, counterspell));
        return { idempotency_key: 'stale-revision', planned_swaps: [first, { ...stale, expected_deck_revision: stale.expected_deck_revision - 1 }] };
      },
    },
  ],
  [
    'an outgoing copy that is not in the deck',
    {
      code: 'outgoing_not_in_deck',
      details: 'planned_swaps[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const freeCopy = await scannedCopy(user, lightningBolt);
        return { idempotency_key: 'free-outgoing', planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, outgoing: { copy_id: freeCopy } })) };
      },
    },
  ],
  [
    'an incoming copy that is in a deck',
    {
      code: 'copy_not_free',
      details: 'planned_swaps[1].incoming.copy_id',
      call: async ({ user }, { deckId, bolt }) => ({
        idempotency_key: 'allocated-copy',
        planned_swaps: await twoItems(swapItemOf(user, deckId), (item) => ({ ...item, incoming: { copy_id: bolt } })),
      }),
    },
  ],
  [
    'an incoming copy that another planned swap holds',
    {
      code: 'copy_not_free',
      details: 'planned_swaps[1].incoming.copy_id',
      call: async (client, { deckId, bolt }) => {
        const held = await scannedCopy(client.user, counterspell);
        await planned(client, [await plannedSwapItem(client.user, deckId, held, { outgoing: { copy_id: bolt } })]);
        return {
          idempotency_key: 'held-copy',
          planned_swaps: await twoItems(swapItemOf(client.user, deckId), async (item) => ({
            ...item,
            expected_deck_revision: await revisionOf(client.user, deckId),
            incoming: { copy_id: held },
          })),
        };
      },
    },
  ],
  [
    'a protected copy',
    {
      code: 'protected_copy',
      details: 'planned_swaps[1].incoming.copy_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'protected-copy',
        planned_swaps: await twoItems(swapItemOf(user, deckId), async (item) => {
          await appRequest(user, 'set_copy_protected', { copy_id: (item.incoming as { copy_id: string }).copy_id, protected: true });
          return item;
        }),
      }),
    },
  ],
  [
    'the same deck, incoming card, as_commander, and outgoing card as an open planned swap',
    {
      code: 'duplicate_open',
      details: { pointer: '/planned_swaps/1', planned_swap_id: 'the open planned swap' },
      call: async (client, { deckId, bolt }) => {
        await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } })]);
        return {
          idempotency_key: 'duplicate',
          planned_swaps: await twoItems(swapItemOf(client.user, deckId), (item) => ({ ...item, outgoing: { copy_id: bolt }, reason: `${reason} Again.` })),
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
        await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, counterspell))], 'reused-key');
        return { idempotency_key: 'reused-key', planned_swaps: await twoItems(swapItemOf(client.user, deckId), (item) => item) };
      },
    },
  ],
];

describe('refusals', () => {
  test.each(refusals)('%s is refused, and the call saves nothing', async (_, { code, details, call }) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const request = await call(client, deck);
    const before = await listed(client.user);

    const problem = await aiClientRefusal(client, 'create_planned_swaps', request);

    expect(problem.code).toBe(code);
    if (typeof details === 'string') {
      expect(problem.details).toBe(details);
    } else {
      const expected = 'planned_swap_id' in details ? { ...details, planned_swap_id: before.items[0]!.planned_swap_id } : details;
      expect(JSON.parse(problem.details!)).toEqual(expected);
    }
    expect(await listed(client.user)).toEqual(before);
    const lotus = ((request as { planned_swaps: PlannedSwapInput[] }).planned_swaps[0]!.incoming as { copy_id: string }).copy_id;
    expect(await copyOf(client.user, lotus)).toMatchObject({ free: true });
  });
});

describe('warnings', () => {
  afterEach(() => setCatalogSucceededAt(0));

  test('would_break_validity is the effect that the Add to deck drawer shows for the same copy', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const secondBolt = await scannedCopy(client.user, lightningBolt);
    const preview = await appRead<AddDeckCardPreview>(client.user, 'preview_add_deck_card', { copy_id: secondBolt });
    const drawerEffect = preview.items.find((item) => item.deck_id === deckId)!.effect;

    const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, secondBolt)]);

    expect(drawerEffect).toEqual({ kind: 'would_make_invalid', rules: [{ rule: 'deck_size' }, { rule: 'singleton' }] });
    expect(planned_swaps[0]!.warnings).toEqual([{ code: 'would_break_validity', effect: drawerEffect! }]);
    expect((await listed(client.user)).items[0]).toMatchObject({ status: 'open', effect: drawerEffect });
  });

  test('would_break_validity judges a copy with as_commander as a commander of the deck', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const secondBolt = await scannedCopy(client.user, lightningBolt);

    const { planned_swaps } = await planned(client, [
      await plannedSwapItem(client.user, deckId, secondBolt, {
        incoming: { copy_id: secondBolt, as_commander: true },
        outgoing: { copy_id: commander },
      }),
    ]);

    expect(planned_swaps[0]!.warnings).toContainEqual({
      code: 'would_break_validity',
      effect: { kind: 'would_make_invalid', rules: [{ rule: 'commander_eligibility' }, { rule: 'singleton' }] },
    });
  });

  test('replaces_commander when the outgoing copy is a commander, and as_commander then defaults to true', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const [byDefault, asMain] = await scannedCopies(client.user, counterspell, 2);

    const { planned_swaps } = await planned(client, [
      await plannedSwapItem(client.user, deckId, byDefault!, { ref: 'default', outgoing: { copy_id: commander } }),
      await plannedSwapItem(client.user, deckId, asMain!, {
        ref: 'main',
        incoming: { copy_id: asMain!, as_commander: false },
        outgoing: { copy_id: commander },
      }),
    ]);

    expect(codesOf(planned_swaps[0]!.warnings)).toContain('replaces_commander');
    expect(codesOf(planned_swaps[1]!.warnings)).toContain('replaces_commander');
    const items = (await listed(client.user)).items;
    expect(items.find((item) => item.planned_swap_id === planned_swaps[0]!.planned_swap_id)).toMatchObject({ as_commander: true });
    expect(items.find((item) => item.planned_swap_id === planned_swaps[1]!.planned_swap_id)).toMatchObject({ as_commander: false });
  });

  test('rules_stale when the rules data of the deck is stale', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const [fresh, stale] = await scannedCopies(client.user, lightningBolt, 2);

    const before = await planned(client, [await plannedSwapItem(client.user, deckId, fresh!, { outgoing: { copy_id: bolt } })]);
    await setCatalogSucceededAt(8);
    const after = await planned(client, [
      await plannedSwapItem(client.user, deckId, stale!, { incoming: { copy_id: stale!, as_commander: true }, outgoing: { copy_id: bolt } }),
    ]);

    expect(codesOf(before.planned_swaps[0]!.warnings)).not.toContain('rules_stale');
    expect(codesOf(after.planned_swaps[0]!.warnings)).toContain('rules_stale');
  });
});

describe('idempotency', () => {
  test('a repeat with the same input returns the first result with replayed: true and saves nothing again', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const request = {
      idempotency_key: 'retried-call',
      planned_swaps: [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, blackLotus))],
    };
    const first = await aiClientCall<CreatedPlannedSwaps>(client, 'create_planned_swaps', request);
    const saved = await listed(client.user);

    const repeat = await aiClientCall<CreatedPlannedSwaps>(client, 'create_planned_swaps', request);

    expect(repeat).toEqual({ ...first, replayed: true });
    expect(await listed(client.user)).toEqual(saved);
  });

  test('idempotency keys are per user', async () => {
    const alice = await connectedAiClient();
    const bob = await connectedAiClient();
    const alicesDeck = await deckNamed(alice.user, 'Alice');
    const bobsDeck = await deckNamed(bob.user, 'Bob');

    await planned(alice, [await plannedSwapItem(alice.user, alicesDeck, await scannedCopy(alice.user, blackLotus))], 'shared-key');
    const bobs = await planned(bob, [await plannedSwapItem(bob.user, bobsDeck, await scannedCopy(bob.user, blackLotus))], 'shared-key');

    expect(bobs.replayed).toBe(false);
    expect(await plannedSwapIds(bob.user)).toEqual([bobs.planned_swaps[0]!.planned_swap_id]);
  });

  test('idempotency keys are kept 24 hours, and older keys are deleted', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, blackLotus))], 'old-idempotency-key');
    const retry = async () => ({
      idempotency_key: 'old-idempotency-key',
      planned_swaps: [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, counterspell))],
    });
    const age = (interval: string) =>
      asDatabaseOwner(
        (database) => database`
          update public.ai_write_requests set created_at = now() - ${interval}::interval
          where user_id = ${client.user.userId} and idempotency_key = 'old-idempotency-key'
        `,
      );

    await age('23 hours');
    expect(await aiClientRefusal(client, 'create_planned_swaps', await retry())).toMatchObject({ code: 'idempotency_conflict' });
    await age('25 hours');

    const reused = await aiClientCall<CreatedPlannedSwaps>(client, 'create_planned_swaps', await retry());
    expect(reused.replayed).toBe(false);
    expect(await plannedSwapIds(client.user)).toHaveLength(2);
  });
});

describe('held copies', () => {
  async function heldCopy() {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const [held, free] = await scannedCopies(client.user, counterspell, 2);
    await planned(client, [await plannedSwapItem(client.user, deckId, held!)]);
    return { client, user: client.user, held: held!, free: free!, deckId };
  }

  test('a held copy is not free in its collection entry, the Free filter, or the held quantity', async () => {
    const { user, held, free } = await heldCopy();

    const entries = await appRead<{ items: object[] }>(user, 'search_collection', {});
    const freeCopies = await appRead<{ items: { copy_id: string }[] }>(user, 'search_collection', { rows: 'copies', is_free: true });

    expect(entries.items).toEqual([expect.objectContaining({ quantity: 2, free_quantity: 1, allocated_quantity: 0, held_quantity: 1 })]);
    expect(freeCopies.items.map((item) => item.copy_id)).toEqual([free]);
    expect(await copyOf(user, held)).toMatchObject({ free: false, deck: null });
  });

  test('a held copy cannot go into a deck or be protected', async () => {
    const { user, held } = await heldCopy();
    const otherDeck = await deckNamed(user, 'Other');

    const added = await user.client.rpc('add_deck_card', { request: { deck_id: otherDeck, copy_id: held, unprotect: false } });
    const protectedCopy = await user.client.rpc('set_copy_protected', { request: { copy_id: held, protected: true } });

    expect(added.error).toMatchObject({ code: 'copy_not_free' });
    expect(protectedCopy.error).toMatchObject({ code: 'copy_not_free' });
    expect(await copyOf(user, held)).toMatchObject({ protected: false, deck: null });
  });

  test("the card catalog counts a held copy as owned but not free", async () => {
    const { user, held } = await heldCopy();
    const { card_printing_id } = await asDatabaseOwner(
      async (database) => (await database`select card_printing_id from public.copies where id = ${held}`)[0],
    );
    const { data, error } = await user.client.rpc('get_cards', { query: { printing_ids: [card_printing_id] } });

    expect(error).toBeNull();
    expect((data as unknown as { items: { owned: object }[] }).items[0]!.owned).toEqual({
      quantity: 2,
      free_quantity: 1,
      protected_free_quantity: 0,
    });
  });

  test('deleting a deck deletes its planned swaps and frees their copies', async () => {
    const { user, held, deckId } = await heldCopy();

    await appRequest(user, 'delete_deck', { deck_id: deckId });

    expect((await listed(user)).items).toEqual([]);
    expect(await copyOf(user, held)).toMatchObject({ free: true });
  });
});

describe('list_planned_swaps', () => {
  async function plannedAgo(client: ClaimedAiClient, deckId: string, printingId: string, ago: string) {
    const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, printingId))]);
    const plannedSwapId = planned_swaps[0]!.planned_swap_id;
    await asDatabaseOwner(
      (database) => database`
        update public.planned_swaps set created_at = now() - ${ago}::interval, status_changed_at = now() - ${ago}::interval
        where id = ${plannedSwapId}
      `,
    );
    return plannedSwapId;
  }

  function setStatus(plannedSwapId: string, status: string) {
    return asDatabaseOwner((database) => database`update public.planned_swaps set status = ${status} where id = ${plannedSwapId}`);
  }

  test('lists planned swaps in every state, newest first by default and oldest first on request', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const oldest = await plannedAgo(client, deckId, blackLotus, '3 hours');
    const middle = await plannedAgo(client, deckId, counterspell, '2 hours');
    const newest = await plannedAgo(client, deckId, lightningBolt, '1 hour');
    await setStatus(middle, 'closed');

    const newestFirst = await listed(client.user);
    const oldestFirst = await listed(client.user, { order: 'oldest_first' });

    expect(newestFirst.items.map((item) => [item.planned_swap_id, item.status])).toEqual([
      [newest, 'open'],
      [middle, 'closed'],
      [oldest, 'open'],
    ]);
    expect(oldestFirst.items.map((item) => item.planned_swap_id)).toEqual([oldest, middle, newest]);
    expect(newestFirst.next_cursor).toBeNull();
  });

  test('each item has its deck, change lines with printing, finish, and condition, its reason, and times', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const played = stack(lightningBolt, { condition: 'lightly_played' });
    await committed(client.user, scanBatch([played]));
    const { planned_swaps } = await planned(client, [
      await plannedSwapItem(client.user, deckId, played.copy_ids[0]!, { outgoing: { copy_id: bolt } }),
    ]);
    const deck = await appRead<Deck>(client.user, 'get_deck', { deck_id: deckId });
    const [times] = await asDatabaseOwner(
      (database) => database`
        select to_jsonb(created_at) as created_at, to_jsonb(status_changed_at) as status_changed_at
        from public.planned_swaps where id = ${planned_swaps[0]!.planned_swap_id}
      `,
    );
    const boltCard = deck.cards.find((card) => card.copy_id === bolt)!;

    expect((await listed(client.user)).items).toEqual([
      {
        planned_swap_id: planned_swaps[0]!.planned_swap_id,
        deck_id: deckId,
        deck_name: 'Krenko',
        commander_art_crop_uri: deck.commanders.find((item) => item.copy_id === commander)!.art_crop_uri,
        incoming: {
          kind: 'copy',
          copy_id: played.copy_ids[0],
          name: 'Lightning Bolt',
          image_uris: boltCard.image_uris,
          type_line: 'Instant',
          set: boltCard.set,
          collector_number: boltCard.collector_number,
          finish: 'nonfoil',
          condition: 'lightly_played',
        },
        outgoing: {
          kind: 'copy',
          copy_id: bolt,
          name: 'Lightning Bolt',
          image_uris: boltCard.image_uris,
          type_line: 'Instant',
          set: boltCard.set,
          collector_number: boltCard.collector_number,
          finish: 'nonfoil',
          condition: 'near_mint',
        },
        as_commander: false,
        reason,
        status: 'open',
        close_note: null,
        ...times,
        effect: null,
      },
    ]);
  });

  test('a planned swap with no outgoing card has a null outgoing, and a deleted outgoing copy keeps its card name', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await planned(client, [
      await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, blackLotus), { ref: 'add' }),
      await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, lightningBolt), { ref: 'swap', outgoing: { copy_id: bolt } }),
    ]);

    await appRequest(client.user, 'delete_copy', { copy_id: bolt });

    const items = (await listed(client.user)).items;
    expect(items.find((item) => item.incoming.name === 'Black Lotus')).toMatchObject({ outgoing: null });
    expect(items.find((item) => item.incoming.name === 'Lightning Bolt')!.outgoing).toEqual({
      kind: 'copy',
      copy_id: bolt,
      name: 'Lightning Bolt',
      image_uris: [],
      type_line: 'Instant',
      set: null,
      collector_number: null,
      finish: null,
      condition: null,
    });
  });

  test('only an open planned swap has its current effect', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const [open, closed] = await scannedCopies(client.user, lightningBolt, 2);
    const { planned_swaps } = await planned(client, [
      await plannedSwapItem(client.user, deckId, open!),
      await plannedSwapItem(client.user, deckId, closed!, { incoming: { copy_id: closed!, as_commander: true } }),
    ]);
    await setStatus(planned_swaps[1]!.planned_swap_id, 'closed');

    const items = (await listed(client.user)).items;

    expect(items.find((item) => item.status === 'open')!.effect).toMatchObject({ kind: 'would_make_invalid' });
    expect(items.find((item) => item.status === 'closed')!.effect).toBeNull();
  });

  test("the deck_id and status filters narrow the list, and another user's deck is not found", async () => {
    const client = await connectedAiClient();
    const krenkoDeckId = await deckNamed(client.user, 'Krenko');
    const goblins = await deckNamed(client.user, 'Goblins');
    const inKrenko = await plannedAgo(client, krenkoDeckId, blackLotus, '2 hours');
    const closedInGoblins = await plannedAgo(client, goblins, counterspell, '1 hour');
    const openInGoblins = await plannedAgo(client, goblins, lightningBolt, '30 minutes');
    await setStatus(closedInGoblins, 'closed');
    const othersDeck = await deckNamed(await signUpNewUser(), 'Not yours');

    expect((await listed(client.user, { deck_id: krenkoDeckId })).items.map((item) => item.planned_swap_id)).toEqual([inKrenko]);
    expect((await listed(client.user, { deck_id: goblins, status: 'open' })).items.map((item) => item.planned_swap_id)).toEqual([openInGoblins]);
    expect((await listed(client.user, { status: 'closed' })).items.map((item) => item.planned_swap_id)).toEqual([closedInGoblins]);
    expect((await client.user.client.rpc('list_planned_swaps', { query: { deck_id: othersDeck } })).error).toMatchObject({
      code: 'not_found',
      details: 'deck_id',
    });
    expect((await client.user.client.rpc('list_planned_swaps', { query: { status: 'withdrawn' } })).error).toMatchObject({
      code: 'invalid_argument',
      details: 'status',
    });
  });

  test.each([
    ['newest_first', [2, 1, 0]],
    ['oldest_first', [0, 1, 2]],
  ] as const)('pages of 20 by default and at most 50, %s, with a cursor for the next page', async (order, positions) => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const ids: string[] = [];
    for (const [index, printingId] of [blackLotus, counterspell, lightningBolt].entries()) {
      const { planned_swaps } = await planned(client, [
        await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, printingId)),
      ]);
      ids.push(planned_swaps[0]!.planned_swap_id);
      await asDatabaseOwner(
        (database) => database`
          update public.planned_swaps set created_at = now() - ${`${3 - index} hours`}::interval where id = ${ids[index]!}
        `,
      );
    }
    const expected = positions.map((position) => ids[position]);

    const first = await listed(client.user, { order, limit: 2 });
    const second = await listed(client.user, { order, limit: 2, cursor: first.next_cursor });
    const otherQuery = await client.user.client.rpc('list_planned_swaps', { query: { limit: 2, cursor: first.next_cursor, deck_id: deckId } });
    const tooMany = await client.user.client.rpc('list_planned_swaps', { query: { limit: 51 } });

    expect([...first.items, ...second.items].map((item) => item.planned_swap_id)).toEqual(expected);
    expect(second.next_cursor).toBeNull();
    expect(otherQuery.error).toMatchObject({ code: 'invalid_cursor' });
    expect(tooMany.error).toMatchObject({ code: 'invalid_argument', details: 'limit' });
  });

  test('a page has 20 planned swaps by default', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, counterspell))]);
    await asDatabaseOwner(
      (database) => database`
        insert into public.planned_swaps (user_id, deck_id, incoming_copy_id, incoming_oracle_id, as_commander, reason, status)
        select user_id, deck_id, gen_random_uuid(), incoming_oracle_id, as_commander, reason, 'closed'
        from public.planned_swaps, generate_series(1, 20)
        where id = ${planned_swaps[0]!.planned_swap_id}
      `,
    );

    const page = await listed(client.user);

    expect(page.items).toHaveLength(20);
    expect(page.next_cursor).not.toBeNull();
  });
});

describe('access', () => {
  test("create_planned_swaps refuses the app's token, an anonymous caller, and the secret key", async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Goblins');
    const request = {
      idempotency_key: 'app-token',
      planned_swaps: [await plannedSwapItem(user, deckId, await scannedCopy(user, counterspell))],
    } as unknown as Json;

    expect((await user.client.rpc('create_planned_swaps', { request })).error).toMatchObject({
      code: permissionDenied,
      message: aiClientOnly,
    });
    for (const other of [anonymousClient(), secretKeyClient()]) {
      expect((await other.rpc('create_planned_swaps', { request })).error?.code).toBe(permissionDenied);
    }
    expect((await listed(user)).items).toEqual([]);
  });

  test("another user's planned swaps are unreadable", async () => {
    const alice = await connectedAiClient();
    const bob = await signUpNewUser();
    const deckId = await deckNamed(alice.user, 'Goblins');
    await planned(alice, [await plannedSwapItem(alice.user, deckId, await scannedCopy(alice.user, counterspell))]);

    expect((await listed(alice.user)).items).toHaveLength(1);
    expect((await listed(bob)).items).toEqual([]);
    expect((await bob.client.from('planned_swaps').select('id')).data).toEqual([]);
    expect((await anonymousClient().rpc('list_planned_swaps', { query: {} })).error?.code).toBe(permissionDenied);
  });

  test('direct writes are refused', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, await scannedCopy(client.user, counterspell))]);
    const plannedSwapId = planned_swaps[0]!.planned_swap_id;
    const tables: AppClient = client.user.client;

    const writes = [
      await tables.from('planned_swaps').insert({
        user_id: client.user.userId,
        deck_id: deckId,
        incoming_oracle_id: crypto.randomUUID(),
        as_commander: false,
        reason,
      }),
      await tables.from('planned_swaps').update({ status: 'closed' }).eq('id', plannedSwapId),
      await tables.from('planned_swaps').delete().eq('id', plannedSwapId),
    ];

    expect(writes.map(({ error }) => error?.code)).toEqual(Array(writes.length).fill(permissionDenied));
    expect((await listed(client.user)).items).toEqual([expect.objectContaining({ status: 'open' })]);
  });
});

describe('swap_in_planned_swap', () => {
  async function swapIn(user: TestUser, plannedSwapId: string) {
    return user.client.rpc('swap_in_planned_swap', { request: { planned_swap_id: plannedSwapId } });
  }

  async function changesOf(user: TestUser, deckId: string) {
    return (await appRead<DeckChangePage>(user, 'list_deck_changes', { deck_id: deckId })).items;
  }

  test('puts the held copy into the deck and takes the outgoing copy out in one swapped_in deck change that keeps the reason', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const plannedSwapId = await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } });
    const revision = await revisionOf(client.user, deckId);

    const { data, error } = await swapIn(client.user, plannedSwapId);

    expect(error).toBeNull();
    expect(data).toEqual({ deck_id: deckId, revision: revision + 1 });
    const [change] = await changesOf(client.user, deckId);
    expect(change).toMatchObject({
      revision: revision + 1,
      kind: 'swapped_in',
      reason,
      reverted: false,
    });
    expect(change!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after]).toSorted()).toEqual(
      [
        [newBolt, null, 'main'],
        [bolt, 'main', null],
      ].toSorted(),
    );
    expect((await appRead<Deck>(client.user, 'get_deck', { deck_id: deckId })).cards.map((card) => card.copy_id)).toContain(newBolt);
    expect(await copyOf(client.user, bolt)).toMatchObject({ free: true, deck: null });
    expect(await copyOf(client.user, newBolt)).toMatchObject({ free: false, deck: { deck_id: deckId, role: 'main' } });
    expect((await listed(client.user)).items[0]).toMatchObject({ planned_swap_id: plannedSwapId, status: 'swapped_in', effect: null });
  });

  test('a planned swap with as_commander makes the held copy a commander, replacing the outgoing commander', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const newCommander = await scannedCopy(client.user, krenko);
    const plannedSwapId = await onePlannedSwap(client, deckId, newCommander, { outgoing: { copy_id: commander } });

    expect((await swapIn(client.user, plannedSwapId)).error).toBeNull();

    const deck = await appRead<Deck>(client.user, 'get_deck', { deck_id: deckId });
    expect(deck.commanders.map((item) => item.copy_id)).toEqual([newCommander]);
    expect(deck.cards.map((card) => card.copy_id)).not.toContain(commander);
    const [change] = await changesOf(client.user, deckId);
    expect(change!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after]).toSorted()).toEqual(
      [
        [newCommander, null, 'commander'],
        [commander, 'commander', null],
      ].toSorted(),
    );
  });

  test('a planned swap with as_commander and no outgoing card is refused with commander_limit when the deck has two commanders', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await appRequest(client.user, 'set_deck_commander', { copy_id: bolt, commander: true });
    const held = await scannedCopy(client.user, krenko);
    const plannedSwapId = await onePlannedSwap(client, deckId, held, { incoming: { copy_id: held, as_commander: true } });
    const revision = await revisionOf(client.user, deckId);

    expect((await swapIn(client.user, plannedSwapId)).error).toMatchObject({ code: 'commander_limit' });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect((await listed(client.user)).items[0]).toMatchObject({ status: 'open' });
  });

  test('a planned swap that is not open is refused with not_open, and nothing changes', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    await swapIn(client.user, plannedSwapId);
    const revision = await revisionOf(client.user, deckId);

    const { error } = await swapIn(client.user, plannedSwapId);

    expect(error).toMatchObject({
      code: 'not_open',
      message: 'The planned swap is swapped_in. Only an open planned swap can change.',
      details: 'planned_swap_id',
    });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test("another user's planned swap is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const stranger = await signUpNewUser();

    for (const missing of [plannedSwapId, crypto.randomUUID()]) {
      expect((await swapIn(stranger, missing)).error).toMatchObject({
        code: 'not_found',
        message: 'planned_swap_id is not one of your planned swaps.',
        details: 'planned_swap_id',
      });
    }
    expect((await listed(client.user)).items[0]).toMatchObject({ status: 'open' });
  });

  test.each(['swap in first', 'add first'] as const)(
    'a swap in and a concurrent add of the same copy put it into the planned swap deck only, %s',
    async (first) => {
      const client = await connectedAiClient();
      const { deckId, bolt } = await krenkoDeck(client.user);
      const otherDeck = await deckNamed(client.user, 'Other');
      const held = await scannedCopy(client.user, lightningBolt);
      const plannedSwapId = await onePlannedSwap(client, deckId, held, { outgoing: { copy_id: bolt } });
      const add = async () => client.user.client.rpc('add_deck_card', { request: { deck_id: otherDeck, copy_id: held, unprotect: false } });

      const { swap, addition } = await asDatabaseOwner((database) =>
        database.begin(async (transaction) => {
          await transaction`select id from public.copies where id = ${held} for update`;
          const firstCall = first === 'swap in first' ? swapIn(client.user, plannedSwapId) : add();
          await Bun.sleep(250);
          const secondCall = first === 'swap in first' ? add() : swapIn(client.user, plannedSwapId);
          await Bun.sleep(250);
          return first === 'swap in first' ? { swap: firstCall, addition: secondCall } : { swap: secondCall, addition: firstCall };
        }),
      );

      expect((await swap).error).toBeNull();
      expect((await addition).error).toMatchObject({ code: 'copy_not_free' });
      expect(await copyOf(client.user, held)).toMatchObject({ deck: { deck_id: deckId } });
      expect(await revisionOf(client.user, otherDeck)).toBe(0);
    },
  );
});
