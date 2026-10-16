import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Client } from '@modelcontextprotocol/client';

import {
  catalogFixtureManifest,
  oracleIdOf,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runOracleTagImport,
  runPriceImport,
  spellbookFixtureVariants,
} from './catalog-import-command';
import {
  claimsOf,
  connectAiClient,
  mcpClient,
  mcpLogLines,
  mcpServerUrl,
  postMcp,
  seedMcpCallCounts,
  type AiClient,
} from './ai-clients';
import { asDatabaseOwner, localStackUrl, signUpNewUser, type TestUser } from './local-stack';
import { stack } from './scan-batches';

setDefaultTimeout(120_000);

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const gristModernHorizons = '1925dc45-4dee-4772-aa16-3b4ca54be6c7';
const thassasOracle = '69e615d8-1b79-4a82-ba9f-ee211d67dc95';
const problems = 'https://mtgscan.reilley.dev/problems/';
const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const reason = 'Moves the only Lightning Bolt to the deck that needs removal.';
const bracketSentence =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';
const usdSentence = 'Prices are current Scryfall prices in USD (TCGplayer Market). There is no other currency.';
const catalogSentence =
  'Returns only Commander-legal cards. Misspelled names return no results; there is no fuzzy match. Use search_oracle_tags to find tag slugs.';
const readTools = [
  'search_catalog',
  'search_collection',
  'search_oracle_tags',
  'get_cards',
  'list_card_printings',
  'list_user_tags',
  'get_collection_summary',
  'list_decks',
  'get_deck',
  'list_deck_changes',
  'list_deck_suggestions',
];
const toolNames = [...readTools, 'create_deck_suggestions'];

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runComboImport(spellbookFixtureVariants)).exitCode).toBe(0);
});

async function deckWithCopies(user: TestUser, name: string, copies: number): Promise<string> {
  const scanned = stack(angelicCurator, { copies });
  expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();
  const { data } = await user.client.rpc('create_deck', { request: { name } });
  const deckId = (data as { deck_id: string }).deck_id;
  for (const copyId of scanned.copy_ids) {
    expect((await user.client.rpc('add_deck_card', { request: { deck_id: deckId, copy_id: copyId, unprotect: false } })).error).toBeNull();
  }
  return deckId;
}

async function connected(user: TestUser): Promise<AiClient & { mcp: Client }> {
  const aiClient = await connectAiClient(user);
  const mcp = await mcpClient(aiClient.token);
  await mcp.listTools();
  return { ...aiClient, mcp };
}

function textOf(result: { content: unknown }): string {
  const [block, ...rest] = result.content as { type: string; text: string }[];
  expect(rest).toEqual([]);
  expect(block!.type).toBe('text');
  return block!.text;
}

async function summaryOf(mcp: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await mcp.callTool({ name, arguments: args });
  expect(result.isError).toBeFalsy();
  const json = JSON.stringify(result.structuredContent);
  expect(json).not.toMatch(/image_uris|art_crop_uri/);
  const [summary, rest] = textOf(result).split('\n');
  expect(rest).toBe(json);
  return summary!;
}

describe('the MCP server over HTTP', () => {
  test('answers a call with no token with 401, a WWW-Authenticate challenge, and the protected resource metadata', async () => {
    const response = await postMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(response.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${mcpServerUrl}/oauth-protected-resource"`);
    expect(await response.json()).toEqual({
      type: `${problems}unauthorized`,
      title: 'Unauthorized',
      status: 401,
      detail: 'Sign in to mtgscan from your AI chat.',
    });
    const metadata = await fetch(`${mcpServerUrl}/oauth-protected-resource`);
    expect(await metadata.json()).toEqual({
      resource: mcpServerUrl,
      authorization_servers: [`${localStackUrl}/auth/v1`],
      bearer_methods_supported: ['header'],
    });
  });

  test("the audience of an AI client's token is the MCP server URL that the protected resource metadata names", async () => {
    const { token } = await connectAiClient(await signUpNewUser());
    const { resource } = await (await fetch(`${mcpServerUrl}/oauth-protected-resource`)).json();

    expect(claimsOf(token).aud).toEqual(['authenticated', resource]);
  });

  test("refuses the app's token", async () => {
    const user = await signUpNewUser();
    const { data } = await user.client.auth.getSession();

    const response = await postMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: `Bearer ${data.session!.access_token}` });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(await response.json()).toEqual({
      type: `${problems}unauthorized`,
      title: 'Unauthorized',
      status: 401,
      detail: 'Sign in to mtgscan from your AI chat.',
    });
  });

  test("refuses a revoked AI client's token on its next call", async () => {
    const user = await signUpNewUser();
    const { clientId, token, mcp } = await connected(user);
    expect((await mcp.listTools()).tools.map(({ name }) => name)).toEqual(toolNames);

    expect((await user.client.auth.oauth.revokeGrant({ clientId })).error).toBeNull();

    const response = await postMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: `Bearer ${token}` });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(await response.json()).toEqual({
      type: `${problems}unauthorized`,
      title: 'Unauthorized',
      status: 401,
      detail: "This AI client's session has ended. Connect it again in your AI chat.",
    });
  });

  test('refuses a request body over 64 KB with 413', async () => {
    const { token } = await connectAiClient(await signUpNewUser());

    const response = await postMcp(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_deck', arguments: { deck_id: 'x'.repeat(65 * 1024) } } },
      { Authorization: `Bearer ${token}` },
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toEqual({
      type: `${problems}request-too-large`,
      title: 'Request too large',
      status: 413,
      detail: 'The request body is over 64 KB.',
    });
  });

  test('lists the read tools in order, then create_deck_suggestions, with their annotations and schemas', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const { tools } = await mcp.listTools();

    expect(tools.map(({ name }) => name)).toEqual(toolNames);
    for (const tool of tools.filter(({ name }) => readTools.includes(name))) {
      const [result, toolProblem] = tool.outputSchema!.anyOf as { type: string; additionalProperties: boolean; required: string[] }[];
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect([tool.inputSchema.type, tool.inputSchema.additionalProperties]).toEqual(['object', false]);
      expect([tool.outputSchema!.type, result!.type, result!.additionalProperties]).toEqual(['object', 'object', false]);
      expect(toolProblem!.required).toEqual(['type', 'title', 'detail', 'retryable']);
    }
    const getDeck = tools.find(({ name }) => name === 'get_deck')!;
    expect(getDeck.inputSchema.required).toEqual(['deck_id']);
    const getCards = tools.find(({ name }) => name === 'get_cards')!;
    expect(getCards.inputSchema.oneOf).toEqual([{ required: ['oracle_ids'] }, { required: ['printing_ids'] }]);
    expect((getDeck.outputSchema!.anyOf as { required: string[] }[])[0]!.required).toEqual(
      expect.arrayContaining(['deck_id', 'cards', 'evaluation']),
    );
    const listDeckSuggestions = tools.find(({ name }) => name === 'list_deck_suggestions')!;
    expect(listDeckSuggestions.inputSchema.required).toBeUndefined();
    expect(listDeckSuggestions.inputSchema.properties).toMatchObject({ status: { enum: ['open', 'withdrawn', 'stale'] } });
    const createDeckSuggestions = tools.find(({ name }) => name === 'create_deck_suggestions')!;
    expect(createDeckSuggestions!.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    for (const sentence of [
      'This tool does not change any deck. The user reviews each suggestion in the app and decides.',
      'Never offer a protected copy as the reason a card is available.',
      'When two decks want a card and there is one copy for them, the deck with the higher deck priority should get it. Between decks of equal priority, decide which deck needs it more. To move a card, send a pair of suggestions in one call, and make each reason name the other.',
      'Read past suggestions with list_deck_suggestions first.',
    ]) {
      expect(createDeckSuggestions!.description).toContain(sentence);
    }
    expect(createDeckSuggestions!.inputSchema).toMatchObject({
      type: 'object',
      required: ['idempotency_key', 'suggestions'],
      additionalProperties: false,
      properties: { suggestions: { minItems: 1, maxItems: 10, items: { additionalProperties: false } } },
    });
    expect(createDeckSuggestions!.outputSchema).toMatchObject({
      type: 'object',
      anyOf: [
        expect.objectContaining({ required: ['suggestions', 'replayed'], additionalProperties: false }),
        expect.objectContaining({ required: ['type', 'title', 'detail', 'retryable'] }),
      ],
    });
  });

  test('the descriptions carry the catalog sentence, the USD sentence on each tool that returns prices, and the bracket sentence on the deck reads', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const { tools } = await mcp.listTools();

    const withSentence = (sentence: string) => tools.filter(({ description }) => description!.includes(sentence)).map(({ name }) => name);
    expect(withSentence(catalogSentence)).toEqual(['search_catalog']);
    expect(withSentence(usdSentence)).toEqual(['search_catalog', 'search_collection', 'get_cards', 'get_collection_summary', 'get_deck']);
    expect(withSentence(bracketSentence)).toEqual(['list_decks', 'get_deck']);
  });

  test('also serves a client on the 2025 protocol', async () => {
    const { token } = await connectAiClient(await signUpNewUser());
    const legacy = await mcpClient(token, 'legacy');

    expect((await legacy.listTools()).tools.map(({ name }) => name)).toEqual(toolNames);
  });

  test("get_deck returns the user's deck without image URIs or the deck card fields it leaves out, with a one-line summary and the minified JSON", async () => {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Tymna', 2);
    const { data: deck } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
    const { mcp } = await connected(user);

    const result = await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId } });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Tymna: 2 cards at deck revision 2.\n${JSON.stringify(result.structuredContent)}`);
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/image_uris|art_crop_uri/);
    const [card] = (result.structuredContent as { cards: object[] }).cards;
    expect(Object.keys(card!).toSorted()).toEqual([
      'colors',
      'copy_id',
      'finish',
      'mana_value',
      'name',
      'price',
      'printing_id',
      'protected',
      'role',
      'type_line',
    ]);
    expect(result.structuredContent).toMatchObject({
      deck_id: deckId,
      name: 'Tymna',
      revision: (deck as { revision: number }).revision,
      card_count: 2,
      cards: [expect.objectContaining({ name: 'Angelic Curator' }), expect.objectContaining({ name: 'Angelic Curator' })],
    });
  });

  test("get_deck refuses another user's deck with not-found", async () => {
    const deckId = await deckWithCopies(await signUpNewUser(), 'Kinnan', 1);
    const { mcp } = await connected(await signUpNewUser());

    const result = await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId } });

    const notFound = {
      type: `${problems}not-found`,
      title: 'Not found',
      detail: 'deck_id is not one of your decks.',
      pointer: '/deck_id',
      retryable: false,
    };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(notFound);
    expect(textOf(result)).toBe(`Not found: deck_id is not one of your decks.\n${JSON.stringify(notFound)}`);
  });

  test('refuses an unknown argument with invalid-argument and its pointer', async () => {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Atraxa', 1);
    const { mcp } = await connected(user);

    const result = await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId, colour: 'blue' } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}invalid-argument`,
      title: 'Invalid argument',
      detail: 'colour is not a known field.',
      pointer: '/colour',
      retryable: false,
    });
  });

  test('answers a tool call over the rate limit with rate-limited and the time to wait', async () => {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Atraxa', 1);
    const { mcp } = await connected(user);
    await seedMcpCallCounts(user, 'minute', 120);

    const result = await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}rate-limited`,
      title: 'Rate limited',
      detail: 'You can make 120 tool calls a minute. Wait, then try again.',
      retry_after_seconds: expect.any(Number),
      retryable: true,
    });
  });

  test('answers a result over 48 KB with result-too-large', async () => {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Angelic Curator pile', 150);
    const { mcp } = await connected(user);

    const result = await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}result-too-large`,
      title: 'Result too large',
      detail: "The result is over 48 KB. Search the deck's cards with search_collection and its deck filter instead.",
      retryable: false,
    });
  });

  test('answers an unknown tool with invalid-argument on /params/name and does not count the call', async () => {
    const since = new Date();
    const user = await signUpNewUser();
    const { clientId, mcp } = await connected(user);

    const result = await mcp.callTool({ name: 'get_decks', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}invalid-argument`,
      title: 'Invalid argument',
      detail: 'There is no tool named get_decks.',
      pointer: '/params/name',
      retryable: false,
    });
    const counts = await asDatabaseOwner((database) => database`select count from public.mcp_call_counts where user_id = ${user.userId}`);
    expect(counts).toEqual([]);
    const [line] = (await mcpLogLines(since, clientId, 1)).filter(({ parsed }) => parsed.result !== 'ok');
    expect(line!.parsed).toMatchObject({ tool: null, result: 'invalid-argument' });
  });

  test('logs invalid-argument for a request that the MCP SDK refuses', async () => {
    const since = new Date();
    const { clientId, token } = await connectAiClient(await signUpNewUser());

    const response = await postMcp(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { Authorization: `Bearer ${token}`, 'MCP-Protocol-Version': '2026-07-28' },
    );

    expect(response.ok).toBe(false);
    expect((await mcpLogLines(since, clientId, 1)).map(({ parsed }) => parsed)).toEqual([
      { tool: null, client_id: clientId, result: 'invalid-argument', protocol_version: '2026-07-28', duration_ms: expect.any(Number) },
    ]);
  });

  test('logs one line for each request, with no arguments, results, or tokens', async () => {
    const since = new Date();
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Yuriko', 1);
    const aiClient = await connectAiClient(user);
    let requests = 0;
    const mcp = await mcpClient(aiClient.token, 'modern', () => {
      requests += 1;
    });

    await mcp.listTools();
    await mcp.callTool({ name: 'get_deck', arguments: { deck_id: deckId } });
    await mcp.callTool({ name: 'get_deck', arguments: { deck_id: crypto.randomUUID() } });

    const lines = await mcpLogLines(since, aiClient.clientId, requests);
    expect(lines.map(({ parsed }) => [parsed.tool, parsed.result])).toEqual([
      ...Array.from({ length: requests - 2 }, () => [null, 'ok']),
      ['get_deck', 'ok'],
      ['get_deck', 'not-found'],
    ]);
    for (const { parsed } of lines) {
      expect(parsed).toEqual({
        tool: parsed.tool,
        client_id: aiClient.clientId,
        result: parsed.result,
        protocol_version: '2026-07-28',
        duration_ms: expect.any(Number),
      });
    }
    for (const { text } of lines) {
      expect(text).not.toContain(aiClient.token);
      expect(text).not.toContain(deckId);
      expect(text).not.toContain('Yuriko');
    }
  });
});

describe('the read tools over HTTP', () => {
  let mcp: Client;
  let deckId: string;
  let curatorOracleId: string;

  beforeAll(async () => {
    const user = await signUpNewUser();
    deckId = await deckWithCopies(user, 'Tymna', 2);
    const delver = stack(delverInnistrad);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [delver] } })).error).toBeNull();
    const { data: userTag } = await user.client.rpc('create_user_tag', { request: { name: 'Signed' } });
    const userTagId = (userTag as { user_tag_id: string }).user_tag_id;
    const tagged = { copy_id: delver.copy_ids[0], user_tag_id: userTagId, tagged: true };
    expect((await user.client.rpc('set_copy_user_tag', { request: tagged })).error).toBeNull();
    curatorOracleId = await oracleIdOf('Angelic Curator');
    ({ mcp } = await connected(user));
  });

  test.each<[string, () => Record<string, unknown>, string]>([
    ['search_catalog', () => ({ types: ['angel'], limit: 2 }), '2 cards. More with next_cursor.'],
    ['search_collection', () => ({}), '2 of 2 collection entries.'],
    ['search_collection', () => ({ rows: 'copies', deck_ids: [deckId], include_oracle_text: true }), '2 of 2 copies.'],
    ['search_collection', () => ({ user_tags: ['Signed'], is_allocated: true }), 'Nothing in the collection matches.'],
    ['search_oracle_tags', () => ({ text: 'burn', limit: 3 }), '3 Oracle tags.'],
    ['get_cards', () => ({ oracle_ids: [curatorOracleId, crypto.randomUUID()] }), '1 card. 1 not found.'],
    ['get_cards', () => ({ printing_ids: [thassasOracle] }), '1 card.'],
    ['list_card_printings', () => ({ oracle_id: curatorOracleId, owned_only: true }), '1 card printing.'],
    ['list_user_tags', () => ({}), '1 user tag.'],
    ['get_collection_summary', () => ({}), 'Collection total 0.74 USD, 3 of 3 copies priced.'],
    ['list_decks', () => ({}), '1 deck.'],
    ['get_deck', () => ({ deck_id: deckId }), 'Tymna: 2 cards at deck revision 2.'],
    ['list_deck_changes', () => ({ deck_id: deckId, limit: 1 }), '1 deck change. More with next_cursor.'],
  ])('%s returns its result without image URIs, with a one-line summary and the minified JSON', async (name, args, summary) => {
    expect(await summaryOf(mcp, name, args())).toBe(summary);
  });

  test('list_decks returns the deck revision of each deck', async () => {
    const result = await mcp.callTool({ name: 'list_decks', arguments: {} });

    expect(result.structuredContent).toMatchObject({ items: [{ deck_id: deckId, name: 'Tymna', revision: 2 }] });
  });

  test('a bad cursor gets invalid-cursor and its pointer', async () => {
    const result = await mcp.callTool({ name: 'search_catalog', arguments: { types: ['angel'], cursor: 'not a cursor' } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}invalid-cursor`,
      title: 'Invalid cursor',
      detail: 'The cursor is not valid. Start the search again.',
      pointer: '/cursor',
      retryable: false,
    });
  });

  test('an unknown argument to a tool with no arguments gets invalid-argument and its pointer', async () => {
    const result = await mcp.callTool({ name: 'list_decks', arguments: { deck_id: deckId } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ type: `${problems}invalid-argument`, pointer: '/deck_id' });
  });

  test('a page holds 20 rows by default, for copies too', async () => {
    const user = await signUpNewUser();
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [stack(gristModernHorizons, { copies: 25 })] } })).error).toBeNull();
    const { mcp } = await connected(user);

    expect(await summaryOf(mcp, 'search_collection', { rows: 'copies' })).toBe('20 of 25 copies. More with next_cursor.');
  });

  test.each<[string, Record<string, unknown>]>([
    ['search_catalog', { types: ['angel'] }],
    ['search_collection', { rows: 'copies' }],
    ['list_card_printings', {}],
    ['list_deck_changes', {}],
  ])(
    '%s refuses a page of more than 50 rows with invalid-argument on /limit',
    async (name, args) => {
      const result = await mcp.callTool({ name, arguments: { ...args, limit: 51 } });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({
        type: `${problems}invalid-argument`,
        title: 'Invalid argument',
        detail: 'limit can be at most 50 over MCP.',
        pointer: '/limit',
        retryable: false,
      });
    },
  );
});

describe('create_deck_suggestions over HTTP', () => {
  type Pair = { mcp: Client; userId: string; fromDeck: string; toDeck: string; bolt: string; revisions: number[] };

  async function oracleIdOf(cardPrintingId: string): Promise<string> {
    const [row] = await asDatabaseOwner((database) => database`select oracle_id from public.card_printings where id = ${cardPrintingId}`);
    return row.oracle_id;
  }

  async function appRequest(user: TestUser, name: string, request: object) {
    const { data, error } = await user.client.rpc(name as 'create_deck', { request: request as never });
    expect(error).toBeNull();
    return data as { deck_id: string; revision: number };
  }

  async function decksForAPair(): Promise<Pair> {
    const user = await signUpNewUser();
    const scanned = stack(lightningBolt);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();
    const { deck_id: fromDeck } = await appRequest(user, 'create_deck', { name: 'Krenko' });
    await appRequest(user, 'set_deck_priority', { deck_id: fromDeck, priority: 'high' });
    const { revision: fromRevision } = await appRequest(user, 'add_deck_card', { deck_id: fromDeck, copy_id: scanned.copy_ids[0], unprotect: false });
    const { deck_id: toDeck } = await appRequest(user, 'create_deck', { name: 'Goblins' });
    await appRequest(user, 'set_deck_priority', { deck_id: toDeck, priority: 'low' });
    const { mcp } = await connected(user);
    return { mcp, userId: user.userId, fromDeck, toDeck, bolt: scanned.copy_ids[0]!, revisions: [fromRevision, 0] };
  }

  async function pairArguments({ fromDeck, toDeck, bolt, revisions: [fromRevision, toRevision] }: Pair) {
    return {
      idempotency_key: crypto.randomUUID(),
      suggestions: [
        {
          ref: 'to_b',
          deck_id: toDeck,
          expected_deck_revision: toRevision,
          incoming: { oracle_id: await oracleIdOf(lightningBolt), from_deck_id: fromDeck },
          reason,
          pair_with: 'from_a',
        },
        {
          ref: 'from_a',
          deck_id: fromDeck,
          expected_deck_revision: fromRevision,
          incoming: { oracle_id: await oracleIdOf(counterspell) },
          outgoing: { copy_id: bolt },
          reason: 'Counterspell takes the place of the Lightning Bolt that moves to Goblins.',
        },
      ],
    };
  }

  test('one call saves a pair and returns its warnings, with a one-line summary and the minified JSON', async () => {
    const pair = await decksForAPair();

    const result = await pair.mcp.callTool({ name: 'create_deck_suggestions', arguments: await pairArguments(pair) });

    expect(result.isError).toBeFalsy();
    const created = result.structuredContent as {
      suggestions: { ref: string; suggestion_id: string; paired_suggestion_id: string; warnings: { code: string }[] }[];
      replayed: boolean;
    };
    const [toB, fromA] = created.suggestions;
    expect(created.replayed).toBe(false);
    expect(toB).toMatchObject({
      ref: 'to_b',
      paired_suggestion_id: fromA!.suggestion_id,
      warnings: [{ code: 'against_deck_priority', from_deck_priority: 'high', deck_priority: 'low' }],
    });
    expect(fromA).toMatchObject({ ref: 'from_a', paired_suggestion_id: toB!.suggestion_id });
    expect(fromA!.warnings.map(({ code }) => code)).toContain('not_owned');
    const warningCount = toB!.warnings.length + fromA!.warnings.length;
    expect(textOf(result)).toBe(`Saved 2 deck suggestions with ${warningCount} warnings.\n${JSON.stringify(created)}`);
    const saved = await asDatabaseOwner(
      (database) => database`
        select id, deck_id, paired_suggestion_id, client_name from public.deck_suggestions
        where user_id = ${pair.userId} order by deck_id = ${pair.toDeck} desc
      `,
    );
    expect(saved).toEqual([
      { id: toB!.suggestion_id, deck_id: pair.toDeck, paired_suggestion_id: fromA!.suggestion_id, client_name: 'Test AI chat' },
      { id: fromA!.suggestion_id, deck_id: pair.fromDeck, paired_suggestion_id: toB!.suggestion_id, client_name: 'Test AI chat' },
    ]);
  });

  test('a stale revision comes back as stale-revision with its pointer, expected, and current', async () => {
    const pair = await decksForAPair();
    const fromRevision = pair.revisions[0]!;

    const result = await pair.mcp.callTool({
      name: 'create_deck_suggestions',
      arguments: await pairArguments({ ...pair, revisions: [fromRevision - 1, 0] }),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}stale-revision`,
      title: 'Stale revision',
      detail: 'suggestions[1].expected_deck_revision is not the deck revision. Read the deck again.',
      pointer: '/suggestions/1/expected_deck_revision',
      expected: fromRevision - 1,
      current: fromRevision,
      retryable: false,
    });
  });

  async function seededSuggestions(pair: Pair, count: number, createdAgo: string) {
    const counterspellOracleId = await oracleIdOf(counterspell);
    await asDatabaseOwner(
      (database) => database`
        insert into public.deck_suggestions (user_id, deck_id, incoming_oracle_id, as_commander, reason, client_id, created_at)
        select ${pair.userId}, ${pair.toDeck}, ${counterspellOracleId}, false, ${reason}, gen_random_uuid(), now() - ${createdAgo}::interval
        from generate_series(1, ${count})
      `,
    );
  }

  test('the hourly limit is retryable with retry_after_seconds, and the open limit of a deck is not', async () => {
    const hourly = await decksForAPair();
    await seededSuggestions(hourly, 29, '10 minutes');
    const perDeck = await decksForAPair();
    await seededSuggestions(perDeck, 50, '2 hours');

    const hourlyResult = await hourly.mcp.callTool({ name: 'create_deck_suggestions', arguments: await pairArguments(hourly) });
    const perDeckResult = await perDeck.mcp.callTool({
      name: 'create_deck_suggestions',
      arguments: await pairArguments({ ...perDeck, revisions: [perDeck.revisions[0]!, 0] }),
    });

    expect(hourlyResult.structuredContent).toEqual({
      type: `${problems}limit-exceeded`,
      title: 'Limit exceeded',
      detail: 'This call would pass 30 suggestions in an hour. Wait, then try again.',
      pointer: '/suggestions',
      retry_after_seconds: expect.any(Number),
      retryable: true,
    });
    expect(perDeckResult.structuredContent).toEqual({
      type: `${problems}limit-exceeded`,
      title: 'Limit exceeded',
      detail: 'This call would pass 50 open suggestions in the deck of suggestions[0]. Withdraw some first.',
      pointer: '/suggestions/0/deck_id',
      retryable: false,
    });
  });

  test('a nested field at fault comes back with its JSON Pointer', async () => {
    const pair = await decksForAPair();
    const request = await pairArguments(pair);
    request.suggestions[1]!.reason = 'Too short.';

    const result = await pair.mcp.callTool({ name: 'create_deck_suggestions', arguments: request });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}invalid-argument`,
      title: 'Invalid argument',
      detail: 'suggestions[1].reason must be a string of 20 to 600 characters.',
      pointer: '/suggestions/1/reason',
      retryable: false,
    });
  });
});

describe('list_deck_suggestions over HTTP', () => {
  test('one page lists a withdrawn and a stale suggestion with their events, a one-line summary, and the minified JSON', async () => {
    const user = await signUpNewUser();
    const scanned = stack(lightningBolt);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();
    const { data } = await user.client.rpc('create_deck', { request: { name: 'Krenko' } });
    const deckId = (data as { deck_id: string }).deck_id;
    const added = await user.client.rpc('add_deck_card', { request: { deck_id: deckId, copy_id: scanned.copy_ids[0]!, unprotect: false } });
    const [counterspellCard] = await asDatabaseOwner(
      (database) => database`select oracle_id from public.card_printings where id = ${counterspell}`,
    );
    const { mcp } = await connected(user);
    const created = await mcp.callTool({
      name: 'create_deck_suggestions',
      arguments: {
        idempotency_key: crypto.randomUUID(),
        suggestions: [
          {
            ref: 'swap',
            deck_id: deckId,
            expected_deck_revision: (added.data as { revision: number }).revision,
            incoming: { oracle_id: counterspellCard.oracle_id },
            outgoing: { copy_id: scanned.copy_ids[0]! },
            reason: 'Counterspell answers more threats than Lightning Bolt here.',
          },
          {
            ref: 'add',
            deck_id: deckId,
            expected_deck_revision: (added.data as { revision: number }).revision,
            incoming: { oracle_id: counterspellCard.oracle_id },
            reason: 'Counterspell protects the commander from removal.',
          },
        ],
      },
    });
    const [swap, addition] = (created.structuredContent as { suggestions: { suggestion_id: string }[] }).suggestions;
    await asDatabaseOwner(
      (database) => database`
        with withdrawn as (
          update public.deck_suggestions set status = 'withdrawn', status_changed_at = now()
          where id = ${addition!.suggestion_id}
          returning user_id, id, client_id, client_name
        )
        insert into public.deck_suggestion_events (user_id, suggestion_id, kind, client_id, client_name)
        select user_id, id, 'withdrawn', client_id, client_name from withdrawn
      `,
    );
    expect((await user.client.rpc('remove_deck_card', { request: { copy_id: scanned.copy_ids[0]! } })).error).toBeNull();

    const result = await mcp.callTool({ name: 'list_deck_suggestions', arguments: { deck_id: deckId } });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`2 deck suggestions.\n${JSON.stringify(result.structuredContent)}`);
    const { items, next_cursor } = result.structuredContent as {
      items: { suggestion_id: string; status: string; events: { kind: string; client_name: string }[] }[];
      next_cursor: string | null;
    };
    expect(next_cursor).toBeNull();
    expect(items.map(({ suggestion_id }) => suggestion_id).toSorted()).toEqual([swap!.suggestion_id, addition!.suggestion_id].toSorted());
    expect(items.find(({ suggestion_id }) => suggestion_id === swap!.suggestion_id)).toMatchObject({
      deck_name: 'Krenko',
      incoming: { name: 'Counterspell' },
      outgoing: { copy_id: scanned.copy_ids[0], name: 'Lightning Bolt' },
      status: 'stale',
      client_name: 'Test AI chat',
      events: [],
    });
    expect(items.find(({ suggestion_id }) => suggestion_id === addition!.suggestion_id)).toMatchObject({
      outgoing: null,
      status: 'withdrawn',
      events: [{ kind: 'withdrawn', client_name: 'Test AI chat', created_at: expect.any(String) }],
    });
  });

});
