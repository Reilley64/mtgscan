import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export const mcpReadToolNames = [
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
export const mcpWriteToolNames = ['create_deck_suggestions', 'withdraw_deck_suggestion', 'update_deck_suggestion_reason'];
export const mcpToolNames = [...mcpReadToolNames, ...mcpWriteToolNames];

export const modernProtocolVersion = '2026-07-28';
export const aiClientRedirectUri = 'https://chat.example.test/connector/callback';
const aiChatScope = 'openid email profile phone offline_access';

export function mcpServerUrlOf(supabaseUrl: string): string {
  return `${supabaseUrl}/functions/v1/mcp`;
}

export function issuerOf(supabaseUrl: string): string {
  return `${supabaseUrl}/auth/v1`;
}

export function oauthEndpointsOf(supabaseUrl: string) {
  const oauth = `${issuerOf(supabaseUrl)}/oauth`;
  return { registration: `${oauth}/clients/register`, authorization: `${oauth}/authorize`, token: `${oauth}/token` };
}

export type RegisteredAiClient = {
  clientId: string;
  clientSecret: string | null;
};

export type AiClientTokens = {
  access_token: string;
  refresh_token?: string;
};

export type Authorization = {
  consentPage: URL;
  authorizationId: string;
  codeVerifier: string;
};

type SignedInUser = Pick<SupabaseClient, 'auth'>;

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function failure(action: string, response: Response): Promise<Error> {
  return new Error(`${action} failed with ${response.status}: ${await response.text()}`);
}

export async function registerAiClient(
  supabaseUrl: string,
  clientName: string,
  confidential = false,
): Promise<RegisteredAiClient> {
  const response = await fetch(oauthEndpointsOf(supabaseUrl).registration, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [aiClientRedirectUri],
      token_endpoint_auth_method: confidential ? 'client_secret_basic' : 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  if (!response.ok) {
    throw await failure('Client registration', response);
  }
  const body = await response.json();
  return { clientId: body.client_id, clientSecret: body.client_secret ?? null };
}

export async function authorize(supabaseUrl: string, client: RegisteredAiClient): Promise<Authorization> {
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))));
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: aiClientRedirectUri,
    scope: aiChatScope,
    state: crypto.randomUUID(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    resource: mcpServerUrlOf(supabaseUrl),
  });
  const response = await fetch(`${oauthEndpointsOf(supabaseUrl).authorization}?${query}`, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) {
    throw await failure('Authorize', response);
  }
  const consentPage = new URL(location);
  const authorizationId = consentPage.searchParams.get('authorization_id');
  if (consentPage.pathname !== '/oauth/consent' || !authorizationId) {
    throw new Error(`Authorize sent the user to ${consentPage} instead of the consent page`);
  }
  return { consentPage, authorizationId, codeVerifier };
}

export async function approve(user: SignedInUser, authorizationId: string): Promise<string> {
  const { data, error } = await user.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error) {
    throw error;
  }
  const code = new URL(data.redirect_url).searchParams.get('code');
  if (!code) {
    throw new Error(`Approval returned no code: ${data.redirect_url}`);
  }
  return code;
}

async function requestTokens(
  supabaseUrl: string,
  client: RegisteredAiClient,
  action: string,
  grant: Record<string, string>,
): Promise<AiClientTokens> {
  const body = new URLSearchParams({ ...grant, resource: mcpServerUrlOf(supabaseUrl) });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (client.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', client.clientId);
  }
  const response = await fetch(oauthEndpointsOf(supabaseUrl).token, { method: 'POST', headers, body });
  if (!response.ok) {
    throw await failure(action, response);
  }
  return response.json();
}

export function exchangeCode(
  supabaseUrl: string,
  client: RegisteredAiClient,
  code: string,
  codeVerifier: string,
): Promise<AiClientTokens> {
  return requestTokens(supabaseUrl, client, 'Code exchange', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: aiClientRedirectUri,
    code_verifier: codeVerifier,
  });
}

export function refreshTokens(supabaseUrl: string, client: RegisteredAiClient, refreshToken: string): Promise<AiClientTokens> {
  return requestTokens(supabaseUrl, client, 'Refresh', { grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function connectAiClient(
  supabaseUrl: string,
  user: SignedInUser,
  clientName: string,
): Promise<RegisteredAiClient & { tokens: AiClientTokens }> {
  const client = await registerAiClient(supabaseUrl, clientName);
  const { authorizationId, codeVerifier } = await authorize(supabaseUrl, client);
  const details = await user.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) {
    throw details.error;
  }
  const code = await approve(user, authorizationId);
  return { ...client, tokens: await exchangeCode(supabaseUrl, client, code, codeVerifier) };
}

export function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
}

export async function mcpClient(
  mcpServerUrl: string,
  token: string,
  protocol: 'modern' | 'legacy' = 'modern',
  onRequest = () => {},
): Promise<Client> {
  const client = new Client(
    { name: 'mtgscan', version: '1.0.0' },
    protocol === 'modern' ? { versionNegotiation: { mode: { pin: modernProtocolVersion } } } : {},
  );
  const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl), {
    authProvider: { token: async () => token },
    fetch: (input, init) => {
      onRequest();
      return fetch(input, init);
    },
  });
  await client.connect(transport);
  return client;
}
