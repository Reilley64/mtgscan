import {
  Client,
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
  StreamableHTTPClientTransport,
  type AuthorizationServerMetadata,
  type OAuthClientInformationFull,
  type OAuthTokens,
} from '@modelcontextprotocol/client';
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
  'list_planned_swaps',
  'list_buylist',
];
export const mcpWriteToolNames = [
  'create_planned_swaps',
  'create_buylist_cards',
  'close_planned_swap',
  'close_buylist_card',
  'create_user_tag',
  'rename_user_tag',
  'delete_user_tag',
  'restore_user_tag',
  'set_copies_user_tag',
];
const mcpDestructiveToolNames = ['delete_user_tag'];
export const mcpToolNames = [...mcpReadToolNames, ...mcpWriteToolNames];

export function mcpToolAnnotations(name: string) {
  return {
    readOnlyHint: mcpReadToolNames.includes(name),
    destructiveHint: mcpDestructiveToolNames.includes(name),
    idempotentHint: true,
    openWorldHint: false,
  };
}

export const appWriteRefusal = 'AI clients cannot change decks or the collection.';
export const mcpClientInfo = { name: 'mtgscan', version: '1.0.0' };

export const modernProtocolVersion = '2026-07-28';
const aiClientRedirectUri = 'https://chat.example.test/connector/callback';
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

export type ClientKind = 'public' | 'confidential';

export type Authorization = {
  consentPage: URL;
  authorizationId: string;
  state: string;
  codeVerifier: string;
};

export type Approval = {
  code: string;
  iss?: string;
};

type SignedInUser = Pick<SupabaseClient, 'auth'>;

async function failure(action: string, response: Response): Promise<Error> {
  return new Error(`${action} failed with ${response.status}: ${await response.text()}`);
}

export async function discoverAuthorizationServer(supabaseUrl: string): Promise<AuthorizationServerMetadata> {
  const issuer = issuerOf(supabaseUrl);
  const metadata = await discoverAuthorizationServerMetadata(issuer);
  if (!metadata) {
    throw new Error(`No authorization server metadata for ${issuer}`);
  }
  return metadata;
}

export function registerAiClient(
  metadata: AuthorizationServerMetadata,
  clientName: string,
  kind: ClientKind,
): Promise<OAuthClientInformationFull> {
  return registerClient(metadata.issuer, {
    metadata,
    clientMetadata: {
      client_name: clientName,
      redirect_uris: [aiClientRedirectUri],
      token_endpoint_auth_method: kind === 'confidential' ? 'client_secret_basic' : 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
}

export async function authorize(
  metadata: AuthorizationServerMetadata,
  resource: string,
  client: OAuthClientInformationFull,
): Promise<Authorization> {
  const state = crypto.randomUUID();
  const { authorizationUrl, codeVerifier } = await startAuthorization(metadata.issuer, {
    metadata,
    clientInformation: client,
    redirectUrl: aiClientRedirectUri,
    scope: aiChatScope,
    state,
    resource,
  });
  const response = await fetch(authorizationUrl, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) {
    throw await failure('Authorize', response);
  }
  const consentPage = new URL(location);
  const authorizationId = consentPage.searchParams.get('authorization_id');
  if (consentPage.pathname !== '/oauth/consent' || !authorizationId) {
    throw new Error(`Authorize sent the user to ${consentPage} instead of the consent page`);
  }
  return { consentPage, authorizationId, state, codeVerifier };
}

export async function approve(user: SignedInUser, { authorizationId, state }: Authorization): Promise<Approval> {
  const { data, error } = await user.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error) {
    throw error;
  }
  const redirect = new URL(data.redirect_url).searchParams;
  const code = redirect.get('code');
  if (!code || redirect.get('state') !== state) {
    throw new Error(`Approval returned no code or another state: ${data.redirect_url}`);
  }
  return { code, iss: redirect.get('iss') ?? undefined };
}

export function exchangeCode(
  metadata: AuthorizationServerMetadata,
  resource: string,
  client: OAuthClientInformationFull,
  { codeVerifier }: Authorization,
  { code, iss }: Approval,
): Promise<OAuthTokens> {
  return exchangeAuthorization(metadata.issuer, {
    metadata,
    clientInformation: client,
    authorizationCode: code,
    iss,
    codeVerifier,
    redirectUri: aiClientRedirectUri,
    resource,
  });
}

export function refreshTokens(
  metadata: AuthorizationServerMetadata,
  resource: string,
  client: OAuthClientInformationFull,
  refreshToken: string,
): Promise<OAuthTokens> {
  return refreshAuthorization(metadata.issuer, { metadata, clientInformation: client, refreshToken, resource });
}

export async function allowAiClient(
  metadata: AuthorizationServerMetadata,
  resource: string,
  user: SignedInUser,
  clientName: string,
  kind: ClientKind,
): Promise<{ client: OAuthClientInformationFull; tokens: OAuthTokens }> {
  const client = await registerAiClient(metadata, clientName, kind);
  const authorization = await authorize(metadata, resource, client);
  const details = await user.auth.oauth.getAuthorizationDetails(authorization.authorizationId);
  if (details.error) {
    throw details.error;
  }
  const approval = await approve(user, authorization);
  return { client, tokens: await exchangeCode(metadata, resource, client, authorization, approval) };
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
    mcpClientInfo,
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
