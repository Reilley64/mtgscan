import { isDeepStrictEqual, parseArgs } from 'node:util';

import { buildDiscoveryUrls, SUPPORTED_PROTOCOL_VERSIONS, type Client } from '@modelcontextprotocol/client';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import type { CreatedDeck, Deck } from '../decks';
import type { CreatedPlannedSwaps, PlannedSwapPage } from '../planned-swaps';
import {
  appWriteRefusal,
  approve,
  authorize,
  claimsOf,
  exchangeCode,
  issuerOf,
  mcpClient,
  mcpClientInfo,
  mcpServerUrlOf,
  mcpToolAnnotations,
  mcpToolNames,
  modernProtocolVersion,
  oauthEndpointsOf,
  refreshTokens,
  registerAiClient,
  type AiClientTokens,
  type Authorization,
  type ClientKind,
  type RegisteredAiClient,
} from '../mcp-connection';
import type { CatalogRow, SearchPage } from '../search';
import { hostedSupabaseUrl, isHostedTestUserPassword, isLocalStack, localSupabaseUrl, testUser } from '../test-user/account';

const usage = 'Usage: bun mcp-preflight/main.ts [--hosted]';
const hostedConsentPage = 'https://mtgscan.reilley.dev/oauth/consent';
const deckName = 'MCP pre-flight';
const searchedCard = 'Counterspell';
const reason = 'The MCP pre-flight checks that an AI client can plan a swap.';

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { hosted: { type: 'boolean', default: false } } });

function refuse(message: string): never {
  console.error(message);
  console.error(usage);
  process.exit(2);
}

function supabaseUrl(): string {
  if (!values.hosted) {
    return process.env.SUPABASE_URL ?? localSupabaseUrl;
  }
  const hosted = hostedSupabaseUrl(process.env);
  if ('refusal' in hosted) {
    refuse(hosted.refusal);
  }
  return hosted.url;
}

const url = supabaseUrl();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function testUserPassword(): string {
  if (!values.hosted) {
    if (!isLocalStack(url)) {
      refuse(`Without --hosted, the MCP pre-flight runs only on local Supabase, such as ${localSupabaseUrl}. Use --hosted for the hosted project.`);
    }
    return testUser.password;
  }
  const password = process.env.EXPO_PUBLIC_TEST_USER_PASSWORD;
  if (!isHostedTestUserPassword(password)) {
    refuse(
      'Set EXPO_PUBLIC_TEST_USER_PASSWORD to the hosted test user password from ~/.config/mtgscan/test-app.env. The local default password is refused.',
    );
  }
  return password;
}

const password = testUserPassword();
if (!publishableKey || !secretKey) {
  refuse(
    values.hosted
      ? `Set SUPABASE_PUBLISHABLE_KEY to the publishable key of ${url}, and load SUPABASE_SECRET_KEY with \`bun --env-file=.env.hosted\`.`
      : 'Set SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY to the PUBLISHABLE_KEY and SECRET_KEY values from `bunx supabase@2.120.0 status -o env`.',
  );
}

const mcpServerUrl = mcpServerUrlOf(url);
const issuer = issuerOf(url);
const rfc8414MetadataUrl = `${new URL(issuer).origin}/.well-known/oauth-authorization-server${new URL(issuer).pathname}`;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const testUserClient = createClient<Database>(url, publishableKey, clientOptions);
const admin = createClient<Database>(url, secretKey, clientOptions);

function aiClientDataApi(token: string) {
  return createClient<Database>(url, publishableKey!, { ...clientOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
}

type ConnectedClient = RegisteredAiClient & {
  name: string;
  authorization?: Authorization;
  code?: string;
  tokens?: AiClientTokens;
  refreshed?: AiClientTokens;
};

const state: {
  signedIn?: true;
  clients: Partial<Record<ClientKind, ConnectedClient>>;
  createdClientIds: string[];
  deckIds: string[];
  deckId?: string;
  revision?: number;
  searchedOracleId?: string;
  copyIds: string[];
  plannedSwapArguments?: { idempotency_key: string; planned_swaps: Record<string, unknown>[] };
  created?: CreatedPlannedSwaps;
  mcp?: Client;
} = { clients: {}, createdClientIds: [], deckIds: [], copyIds: [] };

function fromEarlierCheck<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Not run, because an earlier check did not pass.');
  }
  return value;
}

function passIf(passed: boolean, detail: string): string {
  if (!passed) {
    throw new Error(detail);
  }
  return detail;
}

type Check = { name: string; run: () => Promise<string> };

const toolsListRequest = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

function postMcp(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(mcpServerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? (text.split('\n').findLast((line) => line.startsWith('data:'))?.slice(5) ?? '')
    : text;
  try {
    return JSON.parse(json);
  } catch {
    return { body: text.slice(0, 300) };
  }
}

async function callTool<Result>(name: string, toolArguments: Record<string, unknown>): Promise<{ result: Result; isError: boolean }> {
  const mcp = fromEarlierCheck(state.mcp);
  const response = await mcp.callTool({ name, arguments: toolArguments });
  return { result: response.structuredContent as Result, isError: response.isError === true };
}

async function toolResult<Result>(name: string, toolArguments: Record<string, unknown>): Promise<Result> {
  const { result, isError } = await callTool<Result>(name, toolArguments);
  if (isError) {
    throw new Error(`${name} returned a problem: ${JSON.stringify(result)}`);
  }
  return result;
}

const discoveryChecks: Check[] = [
  {
    name: 'A call with no token gets 401 and the protected resource metadata',
    run: async () => {
      const response = await postMcp(toolsListRequest);
      const challenge = response.headers.get('www-authenticate') ?? '';
      const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
      passIf(response.status === 401 && metadataUrl !== undefined, `status ${response.status}, WWW-Authenticate ${challenge || 'missing'}`);
      const metadata = await readJson(await fetch(metadataUrl!));
      return passIf(
        metadata.resource === mcpServerUrl && isDeepStrictEqual(metadata.authorization_servers, [issuer]),
        `resource ${metadata.resource}, authorization servers ${JSON.stringify(metadata.authorization_servers)}`,
      );
    },
  },
  {
    name: 'The authorization server metadata has the issuer, its endpoints, PKCE with S256, and dynamic client registration',
    run: async () => {
      const discoveryUrls = values.hosted ? [{ url: new URL(rfc8414MetadataUrl) }] : buildDiscoveryUrls(issuer);
      let found: { url: URL; metadata: Record<string, any> } | undefined;
      for (const { url: discoveryUrl } of discoveryUrls) {
        const response = await fetch(discoveryUrl);
        if (response.ok) {
          found = { url: discoveryUrl, metadata: await response.json() };
          break;
        }
      }
      if (!found) {
        throw new Error(`No metadata at ${discoveryUrls.map(({ url }) => url).join(', ')}`);
      }
      const { url: discoveryUrl, metadata } = found;
      const endpoints = oauthEndpointsOf(url);
      return passIf(
        metadata.issuer === issuer &&
          metadata.registration_endpoint === endpoints.registration &&
          metadata.authorization_endpoint === endpoints.authorization &&
          metadata.token_endpoint === endpoints.token &&
          metadata.code_challenge_methods_supported?.includes('S256') &&
          metadata.scopes_supported?.includes('offline_access'),
        [
          `${discoveryUrl}: issuer ${metadata.issuer}`,
          `registration ${metadata.registration_endpoint}`,
          `code challenge methods ${JSON.stringify(metadata.code_challenge_methods_supported)}`,
          `scopes ${JSON.stringify(metadata.scopes_supported)}`,
        ].join(', '),
      );
    },
  },
  {
    name: 'The test user signs in',
    run: async () => {
      const { error } = await testUserClient.auth.signInWithPassword({ email: testUser.email, password });
      passIf(!error, `${testUser.email}: ${error?.message}`);
      state.signedIn = true;
      return testUser.email;
    },
  },
];

function clientChecks(kind: ClientKind): Check[] {
  const label = `${kind[0]!.toUpperCase()}${kind.slice(1)} client`;
  const client = () => fromEarlierCheck(state.clients[kind]);
  return [
    {
      name: `${label}: dynamic client registration`,
      run: async () => {
        const name = `mtgscan pre-flight ${kind} client`;
        const registered = await registerAiClient(url, name, kind);
        state.createdClientIds.push(registered.clientId);
        state.clients[kind] = { ...registered, name };
        return passIf((kind === 'confidential') === (registered.clientSecret !== null), `client_id ${registered.clientId}`);
      },
    },
    {
      name: `${label}: authorize sends the user to the consent page (supabase/auth#2820)`,
      run: async () => {
        const connected = client();
        const authorization = await authorize(url, connected);
        const consentPage = `${authorization.consentPage.origin}${authorization.consentPage.pathname}`;
        connected.authorization = authorization;
        return passIf(!values.hosted || consentPage === hostedConsentPage, consentPage);
      },
    },
    {
      name: `${label}: the consent page reads the authorization details`,
      run: async () => {
        const connected = client();
        fromEarlierCheck(state.signedIn);
        const { authorizationId } = fromEarlierCheck(connected.authorization);
        const { data, error } = await testUserClient.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error) {
          throw new Error(`status ${error.status}: ${error.message}`);
        }
        const name = 'client' in data ? data.client.name : null;
        return passIf(name === connected.name, `client ${name}, scope "${'scope' in data ? data.scope : ''}"`);
      },
    },
    {
      name: `${label}: approval returns a code`,
      run: async () => {
        const connected = client();
        const { authorizationId } = fromEarlierCheck(connected.authorization);
        connected.code = await approve(testUserClient, authorizationId);
        return 'approved';
      },
    },
    {
      name: `${label}: the token exchange with PKCE and resource issues an access token and a refresh token`,
      run: async () => {
        const connected = client();
        const code = fromEarlierCheck(connected.code);
        const tokens = await exchangeCode(url, connected, code, connected.authorization!.codeVerifier);
        connected.tokens = tokens;
        return passIf(tokens.refresh_token !== undefined, `refresh token ${tokens.refresh_token ? 'issued' : 'missing'}`);
      },
    },
    {
      name: `${label}: refresh issues a new access token`,
      run: async () => {
        const connected = client();
        const { refresh_token } = fromEarlierCheck(connected.tokens);
        const refreshed = await refreshTokens(url, connected, fromEarlierCheck(refresh_token));
        connected.refreshed = refreshed;
        return passIf(refreshed.access_token !== connected.tokens!.access_token, 'new access token issued');
      },
    },
    {
      name: `${label}: the audience is authenticated and the MCP server URL`,
      run: async () => {
        const connected = client();
        const tokens = [fromEarlierCheck(connected.tokens), fromEarlierCheck(connected.refreshed)];
        const claims = tokens.map(({ access_token }) => claimsOf(access_token));
        return passIf(
          claims.every(({ aud, iss, client_id }) =>
            isDeepStrictEqual([aud, iss, client_id], [['authenticated', mcpServerUrl], issuer, connected.clientId]),
          ),
          claims.map((claim) => `aud ${JSON.stringify(claim.aud)}, iss ${claim.iss}, client_id ${claim.client_id}`).join('; '),
        );
      },
    },
  ];
}

function aiClientToken(): string {
  return fromEarlierCheck(state.clients.public?.refreshed).access_token;
}

const dataApiChecks: Check[] = [
  {
    name: "The Data API reads with an AI client's token and its array aud",
    run: async () => {
      const { data, error } = await aiClientDataApi(aiClientToken()).rpc('list_decks');
      const detail = error ? `${error.code}: ${error.message}` : `list_decks returned ${(data as { items: unknown[] }).items.length} decks`;
      return passIf(!error, detail);
    },
  },
  {
    name: "An app write function refuses an AI client's token",
    run: async () => {
      const { data, error } = await aiClientDataApi(aiClientToken()).rpc('create_deck', { request: { name: deckName } });
      if (data) {
        state.deckIds.push((data as unknown as CreatedDeck).deck_id);
      }
      return passIf(
        error?.code === '42501' && error.message === appWriteRefusal,
        error ? `create_deck: ${error.code} ${error.message}` : 'create_deck created a deck',
      );
    },
  },
];

const protocolChecks: Check[] = [
  {
    name: `The MCP server serves protocol ${modernProtocolVersion}`,
    run: async () => {
      const mcp = await mcpClient(mcpServerUrl, aiClientToken());
      state.mcp = mcp;
      return passIf(mcp.getNegotiatedProtocolVersion() === modernProtocolVersion, `negotiated ${mcp.getNegotiatedProtocolVersion()}`);
    },
  },
  ...SUPPORTED_PROTOCOL_VERSIONS.map((version) => ({
    name: `The MCP server serves protocol ${version}`,
    run: async () => {
      const response = await postMcp(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: version, capabilities: {}, clientInfo: mcpClientInfo },
        },
        { Authorization: `Bearer ${aiClientToken()}` },
      );
      const reply = await readJson(response);
      const served = reply.result?.protocolVersion;
      return passIf(served === version, served ? `initialize answered ${served}` : `status ${response.status}, ${JSON.stringify(reply)}`);
    },
  })),
];

const toolChecks: Check[] = [
  {
    name: `tools/list returns the ${mcpToolNames.length} tools in order with their annotations`,
    run: async () => {
      const { tools } = await fromEarlierCheck(state.mcp).listTools();
      const names = tools.map(({ name }) => name);
      passIf(isDeepStrictEqual(names, mcpToolNames), `tools ${names.join(', ')}`);
      const wrongAnnotations = tools.filter(
        ({ name, annotations }) =>
          !isDeepStrictEqual(annotations, mcpToolAnnotations(name)),
      );
      return passIf(
        wrongAnnotations.length === 0,
        wrongAnnotations.length === 0 ? names.join(', ') : `wrong annotations on ${wrongAnnotations.map(({ name }) => name).join(', ')}`,
      );
    },
  },
  {
    name: `A read tool returns its result: search_catalog finds ${searchedCard}`,
    run: async () => {
      const { items } = await toolResult<SearchPage<CatalogRow>>('search_catalog', { names: [searchedCard], limit: 20 });
      const card = items.find(({ name }) => name === searchedCard);
      state.searchedOracleId = card?.oracle_id;
      return passIf(card !== undefined, card ? `oracle_id ${card.oracle_id}` : `no ${searchedCard} in the card catalog`);
    },
  },
  {
    name: 'The test user creates the pre-flight deck in the app',
    run: async () => {
      fromEarlierCheck(state.signedIn);
      const { data, error } = await testUserClient.rpc('create_deck', { request: { name: deckName } });
      if (error) {
        throw new Error(`create_deck: ${error.code} ${error.message}`);
      }
      const { deck_id } = data as unknown as CreatedDeck;
      state.deckIds.push(deck_id);
      state.deckId = deck_id;
      return `deck_id ${deck_id}`;
    },
  },
  {
    name: 'A read tool returns its result: get_deck reads the pre-flight deck',
    run: async () => {
      const deckId = fromEarlierCheck(state.deckId);
      const deck = await toolResult<Deck>('get_deck', { deck_id: deckId });
      state.revision = deck.revision;
      return passIf(deck.name === deckName, `${deck.name} at deck revision ${deck.revision}`);
    },
  },
  {
    name: `The test user scans a free copy of ${searchedCard} in the app`,
    run: async () => {
      const oracleId = fromEarlierCheck(state.searchedOracleId);
      const printings = await testUserClient.rpc('list_card_printings', { query: { oracle_id: oracleId, limit: 1 } });
      const printingId = (printings.data as { items: { printing_id: string }[] } | null)?.items[0]?.printing_id;
      if (!printingId) {
        throw new Error(`list_card_printings: ${printings.error?.message ?? 'no card printing'}`);
      }
      const copyId = crypto.randomUUID();
      const { error } = await testUserClient.rpc('add_scan_batch', {
        batch: { items: [{ card_printing_id: printingId, finish: 'nonfoil', condition: 'near_mint', language: 'en', copy_ids: [copyId] }] },
      });
      if (error) {
        throw new Error(`add_scan_batch: ${error.code} ${error.message}`);
      }
      state.copyIds.push(copyId);
      return `copy_id ${copyId}`;
    },
  },
  {
    name: 'create_planned_swaps saves a planned swap that holds the free copy',
    run: async () => {
      const plannedSwapArguments = {
        idempotency_key: crypto.randomUUID(),
        planned_swaps: [
          {
            ref: 'preflight',
            deck_id: fromEarlierCheck(state.deckId),
            expected_deck_revision: fromEarlierCheck(state.revision),
            incoming: { copy_id: fromEarlierCheck(state.copyIds[0]) },
            reason,
          },
        ],
      };
      const created = await toolResult<CreatedPlannedSwaps>('create_planned_swaps', plannedSwapArguments);
      state.plannedSwapArguments = plannedSwapArguments;
      state.created = created;
      const [plannedSwap] = created.planned_swaps;
      return passIf(
        created.planned_swaps.length === 1 && !created.replayed,
        `planned_swap_id ${plannedSwap?.planned_swap_id}, warnings ${plannedSwap?.warnings.map(({ code }) => code).join(', ') || 'none'}`,
      );
    },
  },
  {
    name: 'list_planned_swaps reads it back',
    run: async () => {
      const created = fromEarlierCheck(state.created);
      const { items } = await toolResult<PlannedSwapPage>('list_planned_swaps', { deck_id: state.deckId });
      const [item] = items;
      return passIf(
        items.length === 1 &&
          item!.planned_swap_id === created.planned_swaps[0]!.planned_swap_id &&
          item!.incoming.kind === 'copy' &&
          item!.incoming.copy_id === state.copyIds[0],
        `${items.length} planned swap`,
      );
    },
  },
  {
    name: 'A stale deck revision gets stale-revision and saves nothing',
    run: async () => {
      const plannedSwapArguments = fromEarlierCheck(state.plannedSwapArguments);
      const [plannedSwap] = plannedSwapArguments.planned_swaps as { expected_deck_revision: number }[];
      const { result, isError } = await callTool<{ type: string; detail: string }>('create_planned_swaps', {
        idempotency_key: crypto.randomUUID(),
        planned_swaps: [{ ...plannedSwap, expected_deck_revision: plannedSwap!.expected_deck_revision + 1 }],
      });
      const { items } = await toolResult<PlannedSwapPage>('list_planned_swaps', { deck_id: state.deckId });
      return passIf(
        isError && result.type.endsWith('/stale-revision') && items.length === 1,
        `${result.type}: ${result.detail}; ${items.length} planned swap in the deck`,
      );
    },
  },
  {
    name: 'A replay with the same idempotency key returns the first result and saves nothing',
    run: async () => {
      const replay = await toolResult<CreatedPlannedSwaps>('create_planned_swaps', fromEarlierCheck(state.plannedSwapArguments));
      const { items } = await toolResult<PlannedSwapPage>('list_planned_swaps', { deck_id: state.deckId });
      return passIf(
        replay.replayed && isDeepStrictEqual(replay.planned_swaps, state.created!.planned_swaps) && items.length === 1,
        `replayed ${replay.replayed}, planned_swap_id ${replay.planned_swaps[0]?.planned_swap_id}; ${items.length} planned swap in the deck`,
      );
    },
  },
  {
    name: "The MCP server refuses the app's token",
    run: async () => {
      fromEarlierCheck(state.signedIn);
      const { data } = await testUserClient.auth.getSession();
      const response = await postMcp(
        toolsListRequest,
        { Authorization: `Bearer ${data.session!.access_token}` },
      );
      return passIf(response.status === 401, `status ${response.status}`);
    },
  },
];

const revokeChecks: Check[] = [
  {
    name: "Revoke ends the AI client's access at once",
    run: async () => {
      const token = aiClientToken();
      const { error } = await testUserClient.auth.oauth.revokeGrant({ clientId: state.clients.public!.clientId });
      if (error) {
        throw new Error(`revokeGrant: ${error.message}`);
      }
      const response = await postMcp(toolsListRequest, { Authorization: `Bearer ${token}` });
      return passIf(
        response.status === 401,
        response.ok
          ? `status ${response.status}. The AI client still reaches the MCP server, so the AI clients alert must say "within an hour".`
          : `status ${response.status}: ${(await readJson(response)).detail}`,
      );
    },
  },
  {
    name: "Revoke refuses the AI client's refresh token",
    run: async () => {
      const connected = fromEarlierCheck(state.clients.public?.refreshed);
      const refreshed = await refreshTokens(url, state.clients.public!, connected.refresh_token!).then(
        () => true,
        () => false,
      );
      return passIf(!refreshed, refreshed ? 'refresh still issues tokens' : 'refresh refused');
    },
  },
];

const cleanupChecks: Check[] = [
  {
    name: 'Cleanup deletes the pre-flight deck, its planned swaps, and the pre-flight copy',
    run: async () => {
      for (const deckId of state.deckIds) {
        const { error } = await testUserClient.rpc('delete_deck', { request: { deck_id: deckId } });
        if (error) {
          throw new Error(`delete_deck ${deckId}: ${error.message}`);
        }
      }
      for (const copyId of state.copyIds) {
        const { error } = await testUserClient.rpc('delete_copy', { request: { copy_id: copyId } });
        if (error) {
          throw new Error(`delete_copy ${copyId}: ${error.message}`);
        }
      }
      const [decks, plannedSwaps, copies] = await Promise.all([
        admin.from('decks').select('id', { count: 'exact', head: true }).in('id', state.deckIds),
        admin.from('planned_swaps').select('id', { count: 'exact', head: true }).in('deck_id', state.deckIds),
        admin.from('copies').select('id', { count: 'exact', head: true }).in('id', state.copyIds),
      ]);
      const left = [decks, plannedSwaps, copies].map(({ count, error }) => count ?? error?.message);
      return passIf(
        left.every((count) => count === 0),
        `decks deleted: ${state.deckIds.length}, left: ${left[0]}; planned swaps left: ${left[1]}; copies deleted: ${state.copyIds.length}, left: ${left[2]}`,
      );
    },
  },
  {
    name: 'Cleanup deletes the pre-flight AI clients',
    run: async () => {
      for (const clientId of state.createdClientIds) {
        const { error } = await admin.auth.admin.oauth.deleteClient(clientId);
        if (error) {
          throw new Error(`deleteClient ${clientId}: ${error.message}`);
        }
      }
      const left = [];
      for (const clientId of state.createdClientIds) {
        if (!(await admin.auth.admin.oauth.getClient(clientId)).error) {
          left.push(clientId);
        }
      }
      return passIf(left.length === 0, `AI clients deleted: ${state.createdClientIds.length}, left: ${left.length}`);
    },
  },
];

type Outcome = { name: string; passed: boolean; detail: string };

async function outcomeOf({ name, run }: Check): Promise<Outcome> {
  try {
    return { name, passed: true, detail: await run() };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

console.log(`MCP pre-flight on ${url}`);
const outcomes: Outcome[] = [];
for (const check of [
  ...discoveryChecks,
  ...clientChecks('public'),
  ...dataApiChecks,
  ...protocolChecks,
  ...toolChecks,
  ...revokeChecks,
  ...clientChecks('confidential'),
  ...cleanupChecks,
]) {
  const outcome = await outcomeOf(check);
  outcomes.push(outcome);
  console.log(`${outcome.passed ? 'PASS' : 'FAIL'}  ${outcome.name}\n      ${outcome.detail}`);
}
await testUserClient.auth.signOut({ scope: 'local' });

const failed = outcomes.filter(({ passed }) => !passed).length;
console.log(`\n${outcomes.length - failed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
