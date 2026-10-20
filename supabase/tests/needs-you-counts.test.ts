import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { closeBuylistCard, markBuylistCardBought } from '../buylist';
import { getDeck, getNeedsYouCounts, listDecks } from '../decks';
import { closePlannedSwap, swapInPlannedSwap } from '../planned-swaps';
import { connectedAiClient } from './ai-clients';
import { oneBuylistCard } from './buylist-card-seeds';
import { catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { call, failed, refused, replyOf } from './database-calls';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { blackLotus, counterspell, deckNamed, krenkoDeck, onePlannedSwap, scannedCopy } from './planned-swap-seeds';

setDefaultTimeout(60_000);

let lotusCard: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  lotusCard = await oracleIdOf('Black Lotus');
});

function countsOf(user: TestUser) {
  return replyOf(user.client, getNeedsYouCounts, {});
}

async function needsYouCountsInDeckList(user: TestUser) {
  const { items } = await replyOf(user.client, listDecks, {});
  return Object.fromEntries(items.map((deck) => [deck.name, deck.needs_you_count]));
}

async function plannedOutCards(user: TestUser, deckId: string) {
  const { cards } = await replyOf(user.client, getDeck, { deck_id: deckId });
  return cards.filter((card) => card.planned_out).map((card) => card.copy_id);
}

describe('get_needs_you_counts', () => {
  test('counts the open planned swaps and open buylist cards, overall and per deck', async () => {
    const client = await connectedAiClient();
    const krenko = await krenkoDeck(client.user);
    const goblins = await krenkoDeck(client.user, 'Goblins');
    await deckNamed(client.user, 'Empty');
    await onePlannedSwap(client, krenko.deckId, await scannedCopy(client.user, counterspell));
    await oneBuylistCard(client, krenko.deckId, lotusCard);
    await oneBuylistCard(client, goblins.deckId, lotusCard);

    const counts = await countsOf(client.user);

    expect(counts.total).toBe(3);
    expect(counts.decks.toSorted((a, b) => b.count - a.count)).toEqual([
      { deck_id: krenko.deckId, count: 2 },
      { deck_id: goblins.deckId, count: 1 },
    ]);
  });

  test('swapped in, bought, and closed items no longer count', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const swappedIn = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const closed = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } });
    const bought = await oneBuylistCard(client, deckId, lotusCard);
    const closedCard = await oneBuylistCard(client, deckId, lotusCard, { outgoing: { copy_id: bolt } });
    await oneBuylistCard(client, deckId, lotusCard, { incoming: { oracle_id: lotusCard, as_commander: true } });
    expect((await countsOf(client.user)).total).toBe(5);

    await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: swappedIn });
    await replyOf(client.user.client, closePlannedSwap, { planned_swap_id: closed });
    await replyOf(client.user.client, markBuylistCardBought, {
      buylist_card_id: bought,
      copy_id: await scannedCopy(client.user, blackLotus),
      unprotect: false,
    });
    await replyOf(client.user.client, closeBuylistCard, { buylist_card_id: closedCard });

    expect(await countsOf(client.user)).toEqual({ total: 1, decks: [{ deck_id: deckId, count: 1 }] });
  });

  test('a user with nothing open has a total of 0 and no decks', async () => {
    const user = await signUpNewUser();
    await krenkoDeck(user);

    expect(await countsOf(user)).toEqual({ total: 0, decks: [] });
  });

  test("a user does not count another user's items", async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    await oneBuylistCard(client, deckId, lotusCard);

    expect(await countsOf(await signUpNewUser())).toEqual({ total: 0, decks: [] });
  });

  test('an unknown field is refused with invalid_argument', async () => {
    const user = await signUpNewUser();

    const result = await call(user.client, getNeedsYouCounts, { deck_id: crypto.randomUUID() } as never);

    expect(result).toMatchObject(refused('invalid_argument', 'deck_id'));
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read the counts', async (_, client) => {
    expect(await call(client(), getNeedsYouCounts)).toMatchObject(failed('42501'));
  });
});

describe('list_decks', () => {
  test("returns each deck's count of open planned swaps and buylist cards", async () => {
    const client = await connectedAiClient();
    const krenko = await krenkoDeck(client.user);
    await deckNamed(client.user, 'Empty');
    await onePlannedSwap(client, krenko.deckId, await scannedCopy(client.user, counterspell));
    await oneBuylistCard(client, krenko.deckId, lotusCard);
    const closed = await oneBuylistCard(client, krenko.deckId, lotusCard, { outgoing: { copy_id: krenko.bolt } });
    await replyOf(client.user.client, closeBuylistCard, { buylist_card_id: closed });

    expect(await needsYouCountsInDeckList(client.user)).toEqual({ Krenko: 2, Empty: 0 });
  });
});

describe('get_deck', () => {
  test('a deck card that an open planned swap takes out is planned out', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);

    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), {
      outgoing: { copy_id: bolt },
    });

    expect(await plannedOutCards(client.user, deckId)).toEqual([bolt]);

    await replyOf(client.user.client, closePlannedSwap, { planned_swap_id: plannedSwapId });

    expect(await plannedOutCards(client.user, deckId)).toEqual([]);
  });

  test('a buylist card marks no deck card planned out', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);

    await oneBuylistCard(client, deckId, lotusCard, { outgoing: { copy_id: bolt } });

    expect(await plannedOutCards(client.user, deckId)).toEqual([]);
  });
});
