import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Client } from '@modelcontextprotocol/client';

import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { claimsOf, connectAiClient, mcpClient, mcpLogLines, mcpServerUrl, postMcp, type AiClient } from './ai-clients';
import { asDatabaseOwner, localStackUrl, signUpNewUser, type TestUser } from './local-stack';
import { stack } from './scan-batches';

setDefaultTimeout(120_000);

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const problems = 'https://mtgscan.reilley.dev/problems/';
const bracketSentence =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
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
  return { ...aiClient, mcp: await mcpClient(aiClient.token) };
}

function seedMinuteCounts(user: TestUser, count: number) {
  return asDatabaseOwner(
    (database) => database`
      insert into public.mcp_call_counts (user_id, period, period_start, count)
      select ${user.userId}, 'minute', date_trunc('minute', now(), 'UTC') + make_interval(mins => minute), ${count}
      from generate_series(0, 1) minute
    `,
  );
}

function textOf(result: { content: unknown }): string {
  const [block, ...rest] = result.content as { type: string; text: string }[];
  expect(rest).toEqual([]);
  expect(block!.type).toBe('text');
  return block!.text;
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
    expect((await mcp.listTools()).tools).toHaveLength(1);

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

  test('lists get_deck as the only tool, with its annotations and schemas', async () => {
    const { mcp } = await connected(await signUpNewUser());

    const { tools } = await mcp.listTools();

    expect(tools.map(({ name }) => name)).toEqual(['get_deck']);
    const [getDeck] = tools;
    expect(getDeck!.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(getDeck!.description).toContain(bracketSentence);
    expect(getDeck!.inputSchema).toMatchObject({ type: 'object', required: ['deck_id'], additionalProperties: false });
    expect(getDeck!.outputSchema).toMatchObject({
      type: 'object',
      anyOf: [
        expect.objectContaining({ required: expect.arrayContaining(['deck_id', 'cards', 'evaluation']) }),
        expect.objectContaining({ required: ['type', 'title', 'detail', 'retryable'] }),
      ],
    });
  });

  test('also serves a client on the 2025 protocol', async () => {
    const { token } = await connectAiClient(await signUpNewUser());
    const legacy = await mcpClient(token, 'legacy');

    expect((await legacy.listTools()).tools.map(({ name }) => name)).toEqual(['get_deck']);
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
    await seedMinuteCounts(user, 120);

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
    expect(result.structuredContent).toMatchObject({ type: `${problems}result-too-large`, retryable: false });
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
