import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { localStackUrl, type TestUser } from './local-stack';

export const mcpServerUrl = `${localStackUrl}/functions/v1/mcp`;
const redirectUri = 'https://chat.example.test/connector/callback';

export type AiClient = {
  clientId: string;
  token: string;
};

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function registerAiClient(): Promise<string> {
  const response = await fetch(`${localStackUrl}/auth/v1/oauth/clients/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test AI chat',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Client registration failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.client_id;
}

async function authorizationId(clientId: string, codeChallenge: string): Promise<string> {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state: crypto.randomUUID(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    resource: mcpServerUrl,
  });
  const response = await fetch(`${localStackUrl}/auth/v1/oauth/authorize?${query}`, { redirect: 'manual' });
  const consentPage = new URL(response.headers.get('location') ?? '');
  if (consentPage.pathname !== '/oauth/consent') {
    throw new Error(`Authorize sent the user to ${consentPage} instead of the consent page`);
  }
  return consentPage.searchParams.get('authorization_id')!;
}

async function exchangeCode(clientId: string, code: string, codeVerifier: string): Promise<string> {
  const response = await fetch(`${localStackUrl}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
      resource: mcpServerUrl,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Code exchange failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

export async function connectAiClient(user: TestUser): Promise<AiClient> {
  const clientId = await registerAiClient();
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeChallenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))));
  const authorization = await authorizationId(clientId, codeChallenge);
  const details = await user.client.auth.oauth.getAuthorizationDetails(authorization);
  if (details.error) {
    throw details.error;
  }
  const { data, error } = await user.client.auth.oauth.approveAuthorization(authorization, { skipBrowserRedirect: true });
  if (error) {
    throw error;
  }
  const code = new URL(data.redirect_url).searchParams.get('code')!;
  return { clientId, token: await exchangeCode(clientId, code, codeVerifier) };
}

export function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
}

export async function mcpClient(token: string, protocol: 'modern' | 'legacy' = 'modern', onRequest = () => {}): Promise<Client> {
  const client = new Client(
    { name: 'mtgscan-tests', version: '1.0.0' },
    protocol === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
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

export type McpLogLine = {
  text: string;
  parsed: Record<string, unknown>;
};

async function edgeRuntimeLog(since: Date): Promise<string> {
  const docker = Bun.spawn(['docker', 'logs', '--since', since.toISOString(), 'supabase_edge_runtime_mtgscan'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([new Response(docker.stdout).text(), new Response(docker.stderr).text()]);
  return out + err;
}

export async function mcpLogLines(since: Date, clientId: string, expected: number): Promise<McpLogLine[]> {
  for (let attempt = 0; ; attempt += 1) {
    const lines = (await edgeRuntimeLog(since))
      .split('\n')
      .filter((text) => text.includes(clientId))
      .map((text) => ({ text, parsed: JSON.parse(text.slice(text.indexOf('{'))) }));
    if (lines.length >= expected || attempt === 20) {
      return lines;
    }
    await Bun.sleep(250);
  }
}

export function postMcp(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(mcpServerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
