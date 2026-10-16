import {
  createMcpHandler,
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import { getEnv } from '@supabase/middleware';
import { createContextClient, verifyAuth } from '@supabase/server/core';
import { withOAuthProtectedResource } from '@supabase/server/oauth-protected-resource';

import {
  httpProblem,
  nameOf,
  problem,
  problemFromPostgres,
  type PostgresError,
  type Problem,
  type ProblemName,
} from './problems.ts';
import { tools, type Tool } from './tools.ts';

const mcpServerUrl = getEnv('MCP_SERVER_URL')!;
const issuer = mcpServerUrl.replace(/\/functions\/v1\/mcp$/, '/auth/v1');
const maxRequestBytes = 64 * 1024;
const maxResultBytes = 48 * 1024;
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

type CallPostgres = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: PostgresError | null }>;

type RequestLog = {
  tool: string | null;
  client_id: string | null;
  result: ProblemName | 'ok';
  protocol_version: string | null;
};

type JsonRpcMessage = { method?: unknown; params?: { name?: unknown; protocolVersion?: unknown } };

export default {
  fetch: withOAuthProtectedResource({ resourceServer: mcpServerUrl, authorizationServer: issuer }, async (request: Request) => {
    const started = performance.now();
    const body = request.method === 'POST' ? await request.text() : null;
    const message = readMessage(body);
    const log: RequestLog = {
      tool: message?.method === 'tools/call' && typeof message.params?.name === 'string' ? message.params.name : null,
      client_id: null,
      result: 'ok',
      protocol_version: request.headers.get('mcp-protocol-version') ?? initializeVersion(message),
    };
    const response = await answer(request, body, log).catch(() => failWith(log, 'internal-error', 500, 'Something went wrong in mtgscan. Try again.'));
    console.log(JSON.stringify({ ...log, duration_ms: Math.round(performance.now() - started) }));
    return response;
  }),
};

async function answer(request: Request, body: string | null, log: RequestLog): Promise<Response> {
  if (body !== null && new TextEncoder().encode(body).length > maxRequestBytes) {
    return failWith(log, 'request-too-large', 413, 'The request body is over 64 KB.');
  }

  const { data: auth, error } = await verifyAuth(request, { auth: 'user', issuer, audience: mcpServerUrl });
  if (error) {
    return error.status === 401
      ? failWith(log, 'unauthorized', 401, 'Sign in to mtgscan from your AI chat.')
      : failWith(log, 'internal-error', 500, 'Something went wrong in mtgscan. Try again.');
  }
  const clientId = auth.jwtClaims?.client_id;
  if (typeof clientId !== 'string') {
    return failWith(log, 'unauthorized', 401, 'Only an AI client can use the mtgscan MCP server.');
  }
  log.client_id = clientId;

  const supabase = createContextClient({ auth: { token: auth.token } });
  const callPostgres: CallPostgres = (name, args) => supabase.rpc(name, args);
  const begun = await callPostgres('begin_mcp_call', { tool: log.tool });
  let refusal: Problem | null = null;
  if (begun.error) {
    refusal = problemFromPostgres(begun.error);
    if (nameOf(refusal) === 'unauthorized') {
      return failWith(log, 'unauthorized', 401, refusal.detail);
    }
    if (nameOf(refusal) !== 'rate-limited') {
      return failWith(log, 'internal-error', 500, 'Something went wrong in mtgscan. Try again.');
    }
  }

  const handler = createMcpHandler(() => mcpServer(callPostgres, refusal, log), { responseMode: 'json' });
  return handler.fetch(body === null ? request : new Request(request.url, { method: request.method, headers: request.headers, body }));
}

function mcpServer(callPostgres: CallPostgres, refusal: Problem | null, log: RequestLog): Server {
  const server = new Server({ name: 'mtgscan', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler('tools/list', () => ({
    tools: tools.map(({ name, title, description, annotations, inputSchema, outputSchema }) => ({
      name,
      title,
      description,
      annotations,
      inputSchema,
      outputSchema,
    })),
  }));
  server.setRequestHandler('tools/call', async (request) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `There is no tool named ${request.params.name}.`);
    }
    const result = refusal ? problemResult(refusal) : await callTool(callPostgres, tool, request.params.arguments ?? {});
    if (result.isError) {
      log.result = nameOf(result.structuredContent as Problem);
    }
    return server.projectCallToolResult(result, tool.outputSchema);
  });
  return server;
}

async function callTool(callPostgres: CallPostgres, tool: Tool, query: Record<string, unknown>): Promise<CallToolResult> {
  const { data, error } = await callPostgres(tool.postgresFunction, { query });
  if (error) {
    return problemResult(problemFromPostgres(error));
  }
  const leftOut = new Set(tool.leftOut);
  const isLeftOut = (key: string) => key === 'image_uris' || key.endsWith('art_crop_uri') || leftOut.has(key);
  const structuredContent = without(isLeftOut, data) as Record<string, unknown>;
  const json = JSON.stringify(structuredContent);
  if (new TextEncoder().encode(json).length > maxResultBytes) {
    return problemResult(problem('result-too-large', `The result is over 48 KB. ${tool.narrowing}`));
  }
  return { structuredContent, content: [{ type: 'text', text: `${tool.summary(structuredContent as never)}\n${json}` }] };
}

function problemResult(found: Problem): CallToolResult {
  return {
    isError: true,
    structuredContent: found,
    content: [{ type: 'text', text: `${found.title}: ${found.detail}\n${JSON.stringify(found)}` }],
  };
}

function without(isLeftOut: (key: string) => boolean, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => without(isLeftOut, item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isLeftOut(key))
        .map(([key, member]) => [key, without(isLeftOut, member)]),
    );
  }
  return value;
}

function failWith(log: RequestLog, name: ProblemName, status: number, detail: string): Response {
  log.result = name;
  return httpProblem(name, status, detail);
}

function readMessage(body: string | null): JsonRpcMessage | null {
  try {
    const message = body === null ? null : JSON.parse(body);
    return message !== null && typeof message === 'object' && !Array.isArray(message) ? message : null;
  } catch {
    return null;
  }
}

function initializeVersion(message: JsonRpcMessage | null): string | null {
  return message?.method === 'initialize' && typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : null;
}
