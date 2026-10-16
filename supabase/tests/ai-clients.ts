import { connectAiClient as connect, mcpClient as connectMcpClient, mcpServerUrlOf } from '../mcp-connection';
import { asDatabaseOwner, localStackUrl, type TestUser } from './local-stack';

export const mcpServerUrl = mcpServerUrlOf(localStackUrl);

export type AiClient = {
  clientId: string;
  token: string;
};

export async function connectAiClient(user: TestUser): Promise<AiClient> {
  const { clientId, tokens } = await connect(localStackUrl, user.client, 'Test AI chat');
  return { clientId, token: tokens.access_token };
}

export function mcpClient(token: string, protocol: 'modern' | 'legacy' = 'modern', onRequest = () => {}) {
  return connectMcpClient(mcpServerUrl, token, protocol, onRequest);
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

export function seedMcpCallCounts(user: TestUser, period: 'minute' | 'day', count: number) {
  return asDatabaseOwner(
    (database) => database`
      insert into public.mcp_call_counts (user_id, period, period_start, count)
      select ${user.userId}, ${period}, date_trunc(${period}, now(), 'UTC') + later * ${`1 ${period}`}::interval, ${count}
      from generate_series(0, 1) later
    `,
  );
}
