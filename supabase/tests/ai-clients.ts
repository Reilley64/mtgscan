import { PostgrestError } from '@supabase/supabase-js';

import {
  databaseFunctionResult,
  type DatabaseFunction,
  type DatabaseFunctionResult,
  type ReplyOf,
  type RequestOf,
} from '../database-function';
import { allowAiClient, mcpServerUrlOf } from '../mcp-connection';
import { expectReplied, parsed } from './database-calls';
import { asDatabaseOwner, asDatabaseRole, localStackUrl, signUpNewUser, type TestUser } from './local-stack';

export const mcpServerUrl = mcpServerUrlOf(localStackUrl);

export type AiClient = {
  clientId: string;
  token: string;
};

export async function connectAiClient(user: TestUser): Promise<AiClient> {
  const { clientId, tokens } = await allowAiClient(localStackUrl, user.client, 'Test AI chat');
  return { clientId, token: tokens.access_token };
}

export type ClaimedAiClient = {
  user: TestUser;
  clientId: string;
};

export async function connectedAiClient(user?: TestUser): Promise<ClaimedAiClient> {
  const clientId = crypto.randomUUID();
  await asDatabaseOwner(
    (database) => database`
      insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
      values (${clientId}, 'dynamic', 'https://chatgpt.com/connector_platform_oauth_redirect', 'authorization_code,refresh_token', 'ChatGPT', 'public', 'none')
    `,
  );
  return { user: user ?? (await signUpNewUser()), clientId };
}

export function aiClientClaims({ user, clientId }: ClaimedAiClient) {
  return {
    sub: user.userId,
    role: 'authenticated',
    aud: ['authenticated', mcpServerUrl],
    client_id: clientId,
  };
}

export async function aiClientCall<Contract extends DatabaseFunction>(
  client: ClaimedAiClient,
  contract: Contract,
  request: RequestOf<Contract>,
): Promise<DatabaseFunctionResult<Contract>> {
  try {
    const [row] = await asDatabaseRole('authenticated', aiClientClaims(client), (database) =>
      database`select ${database.unsafe(`public.${contract.name}`)}(${request as object}::jsonb) as result`,
    );
    return parsed(contract, databaseFunctionResult(contract, { data: row.result, error: null }));
  } catch (thrown) {
    const { errno, message } = thrown as { errno: string; message: string };
    const error = errno === 'PGRST' ? JSON.parse(message) : { code: errno, message, details: '' };
    return databaseFunctionResult(contract, { data: null, error: new PostgrestError({ hint: '', ...error }) });
  }
}

export async function aiClientReply<Contract extends DatabaseFunction>(
  client: ClaimedAiClient,
  contract: Contract,
  request: RequestOf<Contract>,
): Promise<ReplyOf<Contract>> {
  return expectReplied(await aiClientCall(client, contract, request));
}

export type McpLogLine = {
  text: string;
  parsed: Record<string, unknown>;
};

async function edgeRuntimeLog(since: Date): Promise<string> {
  const container = `supabase_edge_runtime_${process.env.SUPABASE_PROJECT_ID ?? 'mtgscan'}`;
  const docker = Bun.spawn(['docker', 'logs', '--since', since.toISOString(), container], {
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

export function seedMcpCallCounts(user: TestUser, period: 'minute' | 'day', count: number) {
  return asDatabaseOwner(
    (database) => database`
      insert into public.mcp_call_counts (user_id, period, period_start, count)
      select ${user.userId}, ${period}, date_trunc(${period}, now(), 'UTC') + later * ${`1 ${period}`}::interval, ${count}
      from generate_series(0, 1) later
    `,
  );
}
