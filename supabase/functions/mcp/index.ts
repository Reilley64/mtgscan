import { createMcpHandler, Server, type CallToolResult } from '@modelcontextprotocol/server';
import { getEnv } from '@supabase/middleware';
import { createContextClient, verifyAuth } from '@supabase/server/core';
import { withOAuthProtectedResource } from '@supabase/server/oauth-protected-resource';

import {
  httpProblem,
  internalErrorDetail,
  nameOf,
  problem,
  problemFromPostgres,
  type Problem,
  type ProblemName,
} from './problems.ts';
import { pagedArguments, toolResult, tools, type Tool } from './tools.ts';

const mcpServerUrl = getEnv('MCP_SERVER_URL')!;
const issuer = mcpServerUrl.replace(/\/functions\/v1\/mcp$/, '/auth/v1');
const maxRequestBytes = 64 * 1024;
const maxResultBytes = 48 * 1024;
const instructions = [
  "mtgscan holds the user's Magic: The Gathering collection and Commander decks.",
  "A deck is the cards in the user's deck box now.",
  'You can read the card catalog, the collection, and the decks.',
  'You cannot change a deck or the collection. The user makes every deck change in the app.',
  'To suggest a card that the user owns, make a planned swap with a free copy of it. The planned swap holds that copy until the user swaps it in or closes it.',
  'Never hold a protected copy. The user keeps protected copies out of decks.',
  'When two decks want a card and there is one copy for them, the deck with the higher deck priority should get it. Between decks of equal priority, decide which deck needs it more.',
  'Do not plan a move between decks. Recommend it in the chat, and the user makes it.',
].join(' ');
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

type RequestLog = {
  tool: string | null;
  client_id: string | null;
  result: ProblemName | 'ok';
  protocol_version: string | null;
};

type JsonRpcMessage = { method?: unknown; params?: { name?: unknown; protocolVersion?: unknown } };

type UserClient = ReturnType<typeof userClient>;

export default {
  fetch: withOAuthProtectedResource({ resourceServer: mcpServerUrl, authorizationServer: issuer }, async (request: Request) => {
    const started = performance.now();
    const body = request.method === 'POST' ? await request.text() : null;
    const message = readMessage(body);
    const log: RequestLog = {
      tool: toolsByName.has(calledToolName(message) ?? '') ? calledToolName(message) : null,
      client_id: null,
      result: 'ok',
      protocol_version: request.headers.get('mcp-protocol-version') ?? initializeVersion(message),
    };
    const response = await verifyAndServe(request, body, log).catch(() => failWith(log, 'internal-error', 500, internalErrorDetail));
    console.log(JSON.stringify({ ...log, duration_ms: Math.round(performance.now() - started) }));
    return response;
  }),
};

function userClient(token: string) {
  return createContextClient({ auth: { token } });
}

async function verifyAndServe(request: Request, body: string | null, log: RequestLog): Promise<Response> {
  if (body !== null && new TextEncoder().encode(body).length > maxRequestBytes) {
    return failWith(log, 'request-too-large', 413, `The request body is over ${maxRequestBytes / 1024} KB.`);
  }

  const { data: auth, error } = await verifyAuth(request, { auth: 'user', issuer, audience: mcpServerUrl });
  if (error) {
    return error.status === 401
      ? failWith(log, 'unauthorized', 401, 'Sign in to mtgscan from your AI chat.')
      : failWith(log, 'internal-error', 500, internalErrorDetail);
  }
  const clientId = auth.jwtClaims?.client_id;
  if (typeof clientId !== 'string') {
    return failWith(log, 'unauthorized', 401, 'Only an AI client can use the mtgscan MCP server.');
  }
  log.client_id = clientId;

  const supabase = userClient(auth.token!);
  const callStart = await supabase.rpc('begin_mcp_call', { tool: log.tool });
  const refusal = callStart.error ? problemFromPostgres(callStart.error) : null;
  if (refusal && nameOf(refusal) === 'unauthorized') {
    return failWith(log, 'unauthorized', 401, refusal.detail);
  }
  if (refusal && nameOf(refusal) !== 'rate-limited') {
    return failWith(log, 'internal-error', 500, internalErrorDetail);
  }

  const handler = createMcpHandler(() => mcpServer(supabase, refusal, log), { responseMode: 'json' });
  const response = await handler.fetch(
    body === null ? request : new Request(request.url, { method: request.method, headers: request.headers, body }),
  );
  if (log.result === 'ok') {
    log.result = (await protocolProblemOf(response)) ?? 'ok';
  }
  return response;
}

function mcpServer(supabase: UserClient, refusal: Problem | null, log: RequestLog): Server {
  const server = new Server({ name: 'mtgscan', version: '1.0.0' }, { capabilities: { tools: {} }, instructions });
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
    const result = !tool
      ? problemResult(problem('invalid-argument', `There is no tool named ${request.params.name}.`, { pointer: '/params/name' }))
      : refusal
        ? problemResult(refusal)
        : await callTool(supabase, tool, request.params.arguments ?? {});
    if (result.isError) {
      log.result = nameOf(result.structuredContent as Problem);
    }
    return server.projectCallToolResult(result, tool?.outputSchema);
  });
  return server;
}

async function callTool(supabase: UserClient, tool: Tool, toolArguments: Record<string, unknown>): Promise<CallToolResult> {
  const paged = pagedArguments(tool, toolArguments);
  if ('problem' in paged) {
    return problemResult(paged.problem);
  }
  const argumentName = tool.annotations.readOnlyHint ? 'query' : 'request';
  const { data, error } = await supabase.rpc(tool.postgresFunction, { [argumentName]: paged.toolArguments });
  if (error) {
    return problemResult(problemFromPostgres(error));
  }
  const structuredContent = toolResult(tool, data);
  const json = JSON.stringify(structuredContent);
  if (new TextEncoder().encode(json).length > maxResultBytes) {
    return problemResult(problem('result-too-large', `The result is over ${maxResultBytes / 1024} KB. ${tool.tooLargeHint}`));
  }
  return { structuredContent, content: [{ type: 'text', text: `${tool.summary(structuredContent)}\n${json}` }] };
}

function problemResult(toolProblem: Problem): CallToolResult {
  return {
    isError: true,
    structuredContent: toolProblem,
    content: [{ type: 'text', text: `${toolProblem.title}: ${toolProblem.detail}\n${JSON.stringify(toolProblem)}` }],
  };
}

async function protocolProblemOf(response: Response): Promise<ProblemName | null> {
  if (response.status >= 500) {
    return 'internal-error';
  }
  if (response.status >= 400) {
    return 'invalid-argument';
  }
  const reply = response.headers.get('content-type')?.includes('application/json') ? await response.clone().json() : null;
  if (!reply?.error) {
    return null;
  }
  return reply.error.code === -32603 ? 'internal-error' : 'invalid-argument';
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

function calledToolName(message: JsonRpcMessage | null): string | null {
  return message?.method === 'tools/call' && typeof message.params?.name === 'string' ? message.params.name : null;
}

function initializeVersion(message: JsonRpcMessage | null): string | null {
  return message?.method === 'initialize' && typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : null;
}
