import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Client } from '@modelcontextprotocol/client';

import { claimsOf, mcpClient, mcpReadToolNames, mcpToolAnnotations, mcpToolNames, mcpWriteToolNames } from '../mcp-connection';
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
  connectAiClient,
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
const counterspellAlpha = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const problems = 'https://mtgscan.reilley.dev/problems/';
const bracketSentence =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';
const usdSentence = 'Prices are current Scryfall prices in USD (TCGplayer Market). There is no other currency.';
const declinedWriteSentence =
  'If the user declines this call, do not call it again. Tell the user that nothing was saved, and ask what they want to change.';
const catalogSentence =
  'Returns only Commander-legal cards. Misspelled names return no results; there is no fuzzy match. Use search_oracle_tags to find tag slugs.';
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

function plural(amount: number, one: string): string {
  return `${amount} ${amount === 1 ? one : `${one}s`}`;
}

async function connected(user: TestUser): Promise<AiClient & { mcp: Client }> {
  const aiClient = await connectAiClient(user);
  const mcp = await mcpClient(mcpServerUrl, aiClient.token);
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
    expect((await mcp.listTools()).tools.map(({ name }) => name)).toEqual(mcpToolNames);

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

  test('lists the tools in order with their annotations and schemas', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const { tools } = await mcp.listTools();

    expect(tools.map(({ name }) => name)).toEqual(mcpToolNames);
    for (const tool of tools.filter(({ name }) => mcpReadToolNames.includes(name))) {
      const [result, toolProblem] = tool.outputSchema!.anyOf as { type: string; additionalProperties: boolean; required: string[] }[];
      expect(tool.annotations).toEqual(mcpToolAnnotations(tool.name));
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
    const listPlannedSwaps = tools.find(({ name }) => name === 'list_planned_swaps')!;
    expect(listPlannedSwaps.inputSchema.required).toBeUndefined();
    expect(listPlannedSwaps.inputSchema.properties).toMatchObject({
      status: { enum: ['open', 'swapped_in', 'closed', 'moved_to_buylist'] },
    });
    const createPlannedSwaps = tools.find(({ name }) => name === 'create_planned_swaps')!;
    expect(mcpWriteToolNames).toEqual(['create_planned_swaps', 'create_buylist_cards', 'close_planned_swap', 'close_buylist_card']);
    expect(createPlannedSwaps.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(createPlannedSwaps.inputSchema).toMatchObject({
      type: 'object',
      required: ['idempotency_key', 'planned_swaps'],
      additionalProperties: false,
      properties: { planned_swaps: { minItems: 1, maxItems: 10, items: { additionalProperties: false } } },
    });
    expect(createPlannedSwaps.outputSchema).toMatchObject({
      type: 'object',
      anyOf: [
        expect.objectContaining({ required: ['planned_swaps', 'replayed'], additionalProperties: false }),
        expect.objectContaining({ required: ['type', 'title', 'detail', 'retryable'] }),
      ],
    });
    for (const sentence of [
      'This tool does not change any deck. The planned swap holds the copy until the user swaps it in or closes it in the app.',
      'Never choose a protected copy.',
      'Read past planned swaps with list_planned_swaps first.',
    ]) {
      expect(createPlannedSwaps.description).toContain(sentence);
    }
    const closePlannedSwap = tools.find(({ name }) => name === 'close_planned_swap')!;
    expect(closePlannedSwap.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(closePlannedSwap.inputSchema).toMatchObject({ required: ['planned_swap_id'], additionalProperties: false });
    expect(closePlannedSwap.outputSchema).toMatchObject({
      anyOf: [expect.objectContaining({ required: ['id', 'changed'], additionalProperties: false }), expect.anything()],
    });
    expect(closePlannedSwap.description).toContain('This tool does not change any deck. Its held copy becomes free.');
    const listBuylist = tools.find(({ name }) => name === 'list_buylist')!;
    expect(listBuylist.inputSchema.properties).toMatchObject({ status: { enum: ['open', 'bought', 'closed'] } });
    const createBuylistCards = tools.find(({ name }) => name === 'create_buylist_cards')!;
    expect(createBuylistCards.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(createBuylistCards.inputSchema).toMatchObject({
      required: ['idempotency_key', 'buylist_cards'],
      additionalProperties: false,
      properties: {
        buylist_cards: {
          minItems: 1,
          maxItems: 10,
          items: { additionalProperties: false, properties: { incoming: { required: ['oracle_id'], additionalProperties: false } } },
        },
      },
    });
    expect(createBuylistCards.outputSchema).toMatchObject({
      anyOf: [expect.objectContaining({ required: ['buylist_cards', 'replayed'], additionalProperties: false }), expect.anything()],
    });
    for (const sentence of [
      'This tool does not change any deck. The user marks the buylist card bought in the app after scanning a new copy.',
      'When the user has a free copy of the card that is not protected, make a planned swap with it instead.',
      'Read past buylist cards with list_buylist first.',
    ]) {
      expect(createBuylistCards.description).toContain(sentence);
    }
    const closeBuylistCard = tools.find(({ name }) => name === 'close_buylist_card')!;
    expect(closeBuylistCard.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(closeBuylistCard.inputSchema).toMatchObject({ required: ['buylist_card_id'], additionalProperties: false });
    expect(closeBuylistCard.outputSchema).toMatchObject({
      anyOf: [expect.objectContaining({ required: ['id', 'changed'], additionalProperties: false }), expect.anything()],
    });
  });

  test('the descriptions carry the catalog sentence, the USD sentence on each tool that returns prices, the bracket sentence on the deck reads, and the declined write sentence on the write tools', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const { tools } = await mcp.listTools();

    const withSentence = (sentence: string) => tools.filter(({ description }) => description!.includes(sentence)).map(({ name }) => name);
    expect(withSentence(catalogSentence)).toEqual(['search_catalog']);
    expect(withSentence(usdSentence)).toEqual(['search_catalog', 'search_collection', 'get_cards', 'get_collection_summary', 'get_deck']);
    expect(withSentence(bracketSentence)).toEqual(['list_decks', 'get_deck']);
    expect(withSentence(declinedWriteSentence)).toEqual(mcpWriteToolNames);
  });

  test('the server instructions say that the AI cannot change a deck, plans swaps with free copies, adds cards the user lacks to the buylist, never holds a protected copy, follows deck priority, and recommends a move between decks in the chat', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const instructions = mcp.getInstructions();

    for (const sentence of [
      'You cannot change a deck or the collection.',
      'To suggest a card that the user owns, make a planned swap with a free copy of it.',
      'To suggest a card that the user lacks, add a buylist card for it.',
      'Never hold a protected copy.',
      'When two decks want a card and there is one copy for them, the deck with the higher deck priority should get it.',
      'Do not plan a move between decks. Recommend it in the chat, and the user makes it.',
    ]) {
      expect(instructions).toContain(sentence);
    }
  });

  test('also serves a client on the 2025 protocol', async () => {
    const { token } = await connectAiClient(await signUpNewUser());
    const legacy = await mcpClient(mcpServerUrl, token, 'legacy');

    expect((await legacy.listTools()).tools.map(({ name }) => name)).toEqual(mcpToolNames);
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
      'planned_out',
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
    const mcp = await mcpClient(mcpServerUrl, aiClient.token, 'modern', () => {
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
    ['list_planned_swaps', () => ({ deck_id: deckId }), '0 planned swaps.'],
    ['list_buylist', () => ({ deck_id: deckId }), '0 buylist cards.'],
  ])('%s returns its result without image URIs, with a one-line summary and the minified JSON', async (name, args, summary) => {
    expect(await summaryOf(mcp, name, args())).toBe(summary);
  });

  test('list_decks returns the deck revision and the Needs you count of each deck', async () => {
    const result = await mcp.callTool({ name: 'list_decks', arguments: {} });

    expect(result.structuredContent).toMatchObject({ items: [{ deck_id: deckId, name: 'Tymna', revision: 2, needs_you_count: 0 }] });
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
    ['list_planned_swaps', {}],
    ['list_buylist', {}],
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

describe('planned swaps over HTTP', () => {
  async function deckWithAFreeCopy() {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Tymna', 1);
    const scanned = stack(angelicCurator);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();
    const { mcp } = await connected(user);
    return { user, mcp, deckId, freeCopy: scanned.copy_ids[0]! };
  }

  function plannedSwapArguments(deckId: string, copyId: string) {
    return {
      idempotency_key: crypto.randomUUID(),
      planned_swaps: [
        {
          ref: 'curator',
          deck_id: deckId,
          expected_deck_revision: 1,
          incoming: { copy_id: copyId },
          reason: 'A second Angelic Curator keeps the artifacts safe.',
        },
      ],
    };
  }

  async function plannedSwapIdOf(mcp: Client, deckId: string, copyId: string) {
    const created = await mcp.callTool({ name: 'create_planned_swaps', arguments: plannedSwapArguments(deckId, copyId) });
    return (created.structuredContent as { planned_swaps: { planned_swap_id: string }[] }).planned_swaps[0]!.planned_swap_id;
  }

  test('create_planned_swaps saves a planned swap with its warnings, and list_planned_swaps reads it back, each with a one-line summary and the minified JSON', async () => {
    const { mcp, deckId, freeCopy } = await deckWithAFreeCopy();

    const result = await mcp.callTool({ name: 'create_planned_swaps', arguments: plannedSwapArguments(deckId, freeCopy) });

    expect(result.isError).toBeFalsy();
    const created = result.structuredContent as { planned_swaps: { ref: string; planned_swap_id: string; warnings: unknown[] }[]; replayed: boolean };
    const warningCount = created.planned_swaps[0]!.warnings.length;
    expect(textOf(result)).toBe(`Saved 1 planned swap with ${plural(warningCount, 'warning')}.\n${JSON.stringify(created)}`);
    expect(created.replayed).toBe(false);
    expect(created.planned_swaps.map(({ ref }) => ref)).toEqual(['curator']);

    expect(await summaryOf(mcp, 'list_planned_swaps', { status: 'open' })).toBe('1 planned swap.');
    const listed = await mcp.callTool({ name: 'list_planned_swaps', arguments: {} });
    expect(listed.structuredContent).toMatchObject({
      items: [
        {
          planned_swap_id: created.planned_swaps[0]!.planned_swap_id,
          deck_id: deckId,
          deck_name: 'Tymna',
          incoming: { kind: 'copy', copy_id: freeCopy, name: 'Angelic Curator' },
          outgoing: null,
          status: 'open',
          close_note: null,
          client_name: 'Test AI chat',
        },
      ],
      next_cursor: null,
    });
  });

  test('a copy that is not free comes back as copy-not-free with its pointer', async () => {
    const { mcp, deckId, freeCopy } = await deckWithAFreeCopy();
    await mcp.callTool({ name: 'create_planned_swaps', arguments: plannedSwapArguments(deckId, freeCopy) });

    const result = await mcp.callTool({ name: 'create_planned_swaps', arguments: plannedSwapArguments(deckId, freeCopy) });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}copy-not-free`,
      title: 'Copy not free',
      detail: 'planned_swaps[0].incoming.copy_id is in a deck or held by another planned swap. Choose a free copy.',
      pointer: '/planned_swaps/0/incoming/copy_id',
      retryable: false,
    });
  });

  test('a swapped in deck change lists its kind, reason, and client name', async () => {
    const { user, mcp, deckId, freeCopy } = await deckWithAFreeCopy();
    const plannedSwapId = await plannedSwapIdOf(mcp, deckId, freeCopy);
    expect((await user.client.rpc('swap_in_planned_swap', { request: { planned_swap_id: plannedSwapId } })).error).toBeNull();

    const result = await mcp.callTool({ name: 'list_deck_changes', arguments: { deck_id: deckId, limit: 1 } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      items: [{ kind: 'swapped_in', reason: 'A second Angelic Curator keeps the artifacts safe.', client_name: 'Test AI chat' }],
    });
  });

  test('close_planned_swap closes a planned swap, and closing it again returns changed: false, each with a one-line summary', async () => {
    const { mcp, deckId, freeCopy } = await deckWithAFreeCopy();
    const plannedSwapId = await plannedSwapIdOf(mcp, deckId, freeCopy);

    const closed = await mcp.callTool({ name: 'close_planned_swap', arguments: { planned_swap_id: plannedSwapId } });
    const again = await mcp.callTool({ name: 'close_planned_swap', arguments: { planned_swap_id: plannedSwapId } });

    expect(closed.isError).toBeFalsy();
    expect(textOf(closed)).toBe(`Closed planned swap ${plannedSwapId}.\n${JSON.stringify({ id: plannedSwapId, changed: true })}`);
    expect(textOf(again)).toBe(`Planned swap ${plannedSwapId} was already closed.\n${JSON.stringify({ id: plannedSwapId, changed: false })}`);
    expect((await mcp.callTool({ name: 'list_planned_swaps', arguments: {} })).structuredContent).toMatchObject({
      items: [{ planned_swap_id: plannedSwapId, status: 'closed', close_note: 'closed_by_ai_client' }],
    });
  });

  test('a swapped in planned swap comes back as not-open from close_planned_swap', async () => {
    const { user, mcp, deckId, freeCopy } = await deckWithAFreeCopy();
    const plannedSwapId = await plannedSwapIdOf(mcp, deckId, freeCopy);
    expect((await user.client.rpc('swap_in_planned_swap', { request: { planned_swap_id: plannedSwapId } })).error).toBeNull();

    const result = await mcp.callTool({ name: 'close_planned_swap', arguments: { planned_swap_id: plannedSwapId } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}not-open`,
      title: 'Not open',
      detail: 'The planned swap is swapped_in. Only an open planned swap can change.',
      pointer: '/planned_swap_id',
      retryable: false,
    });
  });
});

describe('the buylist over HTTP', () => {
  const buylistReason = 'Counterspell answers the spells this deck cannot.';

  async function deckWithAnMcpClient() {
    const user = await signUpNewUser();
    const deckId = await deckWithCopies(user, 'Tymna', 1);
    const { mcp } = await connected(user);
    return { user, mcp, deckId, counterspell: await oracleIdOf('Counterspell') };
  }

  function buylistArguments(deckId: string, oracleId: string) {
    return {
      idempotency_key: crypto.randomUUID(),
      buylist_cards: [{ ref: 'counter', deck_id: deckId, expected_deck_revision: 1, incoming: { oracle_id: oracleId }, reason: buylistReason }],
    };
  }

  async function boughtWithANewCopy(user: TestUser, buylistCardId: string) {
    const scanned = stack(counterspellAlpha);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();
    const bought = { buylist_card_id: buylistCardId, copy_id: scanned.copy_ids[0], unprotect: false };
    expect((await user.client.rpc('mark_buylist_card_bought', { request: bought })).error).toBeNull();
  }

  async function buylistCardIdOf(mcp: Client, deckId: string, oracleId: string) {
    const created = await mcp.callTool({ name: 'create_buylist_cards', arguments: buylistArguments(deckId, oracleId) });
    return (created.structuredContent as { buylist_cards: { buylist_card_id: string }[] }).buylist_cards[0]!.buylist_card_id;
  }

  test('create_buylist_cards adds a buylist card with its warnings, and list_buylist reads it back, each with a one-line summary and the minified JSON', async () => {
    const { mcp, deckId, counterspell } = await deckWithAnMcpClient();

    const result = await mcp.callTool({ name: 'create_buylist_cards', arguments: buylistArguments(deckId, counterspell) });

    expect(result.isError).toBeFalsy();
    const created = result.structuredContent as { buylist_cards: { ref: string; buylist_card_id: string; warnings: unknown[] }[]; replayed: boolean };
    const warningCount = created.buylist_cards[0]!.warnings.length;
    expect(textOf(result)).toBe(`Saved 1 buylist card with ${plural(warningCount, 'warning')}.\n${JSON.stringify(created)}`);
    expect(created.replayed).toBe(false);

    expect(await summaryOf(mcp, 'list_buylist', { status: 'open' })).toBe('1 buylist card.');
    const listed = await mcp.callTool({ name: 'list_buylist', arguments: {} });
    expect(listed.structuredContent).toMatchObject({
      items: [
        {
          buylist_card_id: created.buylist_cards[0]!.buylist_card_id,
          deck_id: deckId,
          deck_name: 'Tymna',
          incoming: { kind: 'card', oracle_id: counterspell, name: 'Counterspell' },
          outgoing: null,
          status: 'open',
          close_note: null,
          client_name: 'Test AI chat',
        },
      ],
      next_cursor: null,
    });
  });

  test('a card with a free copy comes back as free-copy-exists with its pointer and the free copies', async () => {
    const { user, mcp, deckId } = await deckWithAnMcpClient();
    const scanned = stack(angelicCurator);
    expect((await user.client.rpc('add_scan_batch', { batch: { items: [scanned] } })).error).toBeNull();

    const result = await mcp.callTool({ name: 'create_buylist_cards', arguments: buylistArguments(deckId, await oracleIdOf('Angelic Curator')) });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}free-copy-exists`,
      title: 'Free copy exists',
      detail: 'buylist_cards[0].incoming.oracle_id has a free copy that is not protected. Make a planned swap with it instead.',
      pointer: '/buylist_cards/0/incoming/oracle_id',
      copy_ids: scanned.copy_ids,
      retryable: false,
    });
  });

  test('a bought deck change lists its kind, reason, and client name', async () => {
    const { user, mcp, deckId, counterspell } = await deckWithAnMcpClient();
    const buylistCardId = await buylistCardIdOf(mcp, deckId, counterspell);
    await boughtWithANewCopy(user, buylistCardId);

    const result = await mcp.callTool({ name: 'list_deck_changes', arguments: { deck_id: deckId, limit: 1 } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ items: [{ kind: 'bought', reason: buylistReason, client_name: 'Test AI chat' }] });
    expect(await summaryOf(mcp, 'list_buylist', { status: 'bought' })).toBe('1 buylist card.');
  });

  test('close_buylist_card closes a buylist card, and closing it again returns changed: false, each with a one-line summary', async () => {
    const { mcp, deckId, counterspell } = await deckWithAnMcpClient();
    const buylistCardId = await buylistCardIdOf(mcp, deckId, counterspell);

    const closed = await mcp.callTool({ name: 'close_buylist_card', arguments: { buylist_card_id: buylistCardId } });
    const again = await mcp.callTool({ name: 'close_buylist_card', arguments: { buylist_card_id: buylistCardId } });

    expect(closed.isError).toBeFalsy();
    expect(textOf(closed)).toBe(`Closed buylist card ${buylistCardId}.\n${JSON.stringify({ id: buylistCardId, changed: true })}`);
    expect(textOf(again)).toBe(`Buylist card ${buylistCardId} was already closed.\n${JSON.stringify({ id: buylistCardId, changed: false })}`);
    expect((await mcp.callTool({ name: 'list_buylist', arguments: {} })).structuredContent).toMatchObject({
      items: [{ buylist_card_id: buylistCardId, status: 'closed', close_note: 'closed_by_ai_client' }],
    });
  });

  test('a bought buylist card comes back as not-open from close_buylist_card', async () => {
    const { user, mcp, deckId, counterspell } = await deckWithAnMcpClient();
    const buylistCardId = await buylistCardIdOf(mcp, deckId, counterspell);
    await boughtWithANewCopy(user, buylistCardId);

    const result = await mcp.callTool({ name: 'close_buylist_card', arguments: { buylist_card_id: buylistCardId } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      type: `${problems}not-open`,
      title: 'Not open',
      detail: 'The buylist card is bought. Only an open buylist card can change.',
      pointer: '/buylist_card_id',
      retryable: false,
    });
  });
});
