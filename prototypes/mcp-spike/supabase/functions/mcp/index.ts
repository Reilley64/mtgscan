import 'jsr:@supabase/functions-js@2/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.3.1'
import { pipeline } from 'npm:@supabase/middleware@1.0.0'
import { fromSupabaseUrl, withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.9.1'
import { z } from 'npm:zod@4.6.5'

type Claims = Record<string, unknown>
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
type DbError = { message: string; details?: string | null; hint?: string | null }

const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
const allowedClientIds = (Deno.env.get('MCP_ALLOWED_CLIENT_IDS') ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const oauthSecurity = [{ type: 'oauth2', scopes: [] }]
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const deckWrite = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }

const changeSchema = z.object({
  op: z.enum(['add', 'remove']).describe('add puts copies into the deck, remove takes copies out.'),
  card_name: z.string().min(1).max(200).describe('Exact card name, for example Sol Ring.'),
  quantity: z.number().int().min(1).max(4),
})
const changesSchema = z.array(changeSchema).min(1).max(20)

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...event }))
}

function stringClaim(claims: Claims | null, name: string) {
  const value = claims?.[name]
  return typeof value === 'string' ? value : Array.isArray(value) ? value.join(' ') : null
}

type RequestInfo = ReturnType<typeof describeRequest>

const requestInfo = new WeakMap<Request, RequestInfo>()

function describeRequest(req: Request, bodyText: string | null) {
  let rpcMethod: string | null = null
  let tool: string | null = null
  if (bodyText) {
    try {
      const body = JSON.parse(bodyText)
      const first = Array.isArray(body) ? body[0] : body
      rpcMethod = typeof first?.method === 'string' ? first.method : null
      tool = rpcMethod === 'tools/call' && typeof first?.params?.name === 'string' ? first.params.name : null
    } catch {
      rpcMethod = null
    }
  }
  return {
    http_method: req.method,
    path: new URL(req.url).pathname,
    protocol_version: req.headers.get('mcp-protocol-version'),
    user_agent: req.headers.get('user-agent'),
    has_bearer: /^bearer\s+/i.test(req.headers.get('authorization') ?? ''),
    rpc_method: rpcMethod,
    tool,
  }
}

function dbErrorText(error: DbError) {
  return [error.message, error.details, error.hint].filter(Boolean).join(' | ')
}

function json(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function tokenError(status: 401 | 403, description: string, resourceMetadataUrl: string | undefined) {
  const challenge = [`Bearer error="${status === 401 ? 'invalid_token' : 'insufficient_scope'}"`, `error_description="${description}"`]
  if (resourceMetadataUrl) challenge.push(`resource_metadata="${resourceMetadataUrl}"`)
  return new Response(JSON.stringify({ error: status === 401 ? 'invalid_token' : 'access_denied', error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge.join(', ') },
  })
}

const app = pipeline(
  [
    withOAuthProtectedResource(),
    withSupabase({ auth: 'user', issuer: fromSupabaseUrl(projectUrl), audience: 'authenticated' }),
  ],
  async (req, ctx) => {
    const claims = ctx.jwtClaims as Claims | null
    const request = requestInfo.get(req) ?? describeRequest(req, null)
    const identity = {
      client_id: stringClaim(claims, 'client_id'),
      aud: stringClaim(claims, 'aud'),
      iss: stringClaim(claims, 'iss'),
      sub: stringClaim(claims, 'sub'),
    }
    const metadataUrl = ctx.oauthProtectedResource?.resourceMetadataUrl

    if (!identity.client_id) {
      log({ event: 'mcp_rejected', reason: 'missing_client_id', ...request, ...identity })
      return tokenError(401, 'This server accepts only OAuth access tokens that carry a client_id claim.', metadataUrl)
    }
    if (allowedClientIds.length > 0 && !allowedClientIds.includes(identity.client_id)) {
      log({ event: 'mcp_rejected', reason: 'client_not_allowed', ...request, ...identity })
      return tokenError(403, 'This OAuth client is not allowed to use this server.', metadataUrl)
    }

    const supabase = ctx.supabase

    async function run(tool: string, args: unknown, work: () => Promise<unknown>): Promise<ToolResult> {
      const started = Date.now()
      try {
        const value = await work()
        log({ ...request, ...identity, event: 'mcp_tool', tool, result: 'ok', ms: Date.now() - started })
        return json(value)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log({ ...request, ...identity, event: 'mcp_tool', tool, result: 'error', error: message, args, ms: Date.now() - started })
        return { content: [{ type: 'text', text: message }], isError: true }
      }
    }

    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'mtgscan-spike', version: '0.1.0' })

        server.registerTool(
          'search_collection',
          {
            title: 'Search my collection',
            description: 'Find cards in the signed-in user\'s collection whose name contains the query. Returns card names and owned quantities.',
            inputSchema: z.object({ query: z.string().min(1).max(100).describe('Part of a card name, for example Sol.') }),
            annotations: readOnly,
            _meta: { securitySchemes: oauthSecurity },
          },
          ({ query }) =>
            run('search_collection', { query }, async () => {
              const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
              const { data, error } = await supabase
                .from('collection_cards')
                .select('card_name, qty')
                .ilike('card_name', pattern)
                .order('card_name')
                .limit(50)
              if (error) throw new Error(dbErrorText(error))
              return { query, count: data.length, cards: data }
            }),
        )

        server.registerTool(
          'get_deck',
          {
            title: 'Get my deck',
            description: 'Return one Commander deck with its cards and current revision. Without deck_id it returns the user\'s only deck.',
            inputSchema: z.object({ deck_id: z.uuid().optional().describe('Deck id. Leave out to use the only deck.') }),
            annotations: readOnly,
            _meta: { securitySchemes: oauthSecurity },
          },
          ({ deck_id }) =>
            run('get_deck', { deck_id }, async () => {
              const query = supabase.from('decks').select('id, name, format, commander, revision, updated_at')
              const { data: decks, error } = deck_id ? await query.eq('id', deck_id) : await query.order('created_at').limit(2)
              if (error) throw new Error(dbErrorText(error))
              if (decks.length === 0) throw new Error(deck_id ? 'deck_not_found' : 'No decks found for this user.')
              if (!deck_id && decks.length > 1) {
                return { message: 'More than one deck exists. Call get_deck again with deck_id.', decks }
              }
              const deck = decks[0]
              const { data: cards, error: cardsError } = await supabase
                .from('deck_cards')
                .select('card_name, qty')
                .eq('deck_id', deck.id)
                .order('card_name')
              if (cardsError) throw new Error(dbErrorText(cardsError))
              const cardCount = cards.reduce((sum, card) => sum + card.qty, deck.commander ? 1 : 0)
              return { ...deck, card_count: cardCount, cards }
            }),
        )

        server.registerTool(
          'preview_deck_change',
          {
            title: 'Preview a deck change',
            description: 'Check a list of card additions and removals against one deck without changing it. Returns the diff, any rule errors, and the deck revision to pass to apply_deck_change.',
            inputSchema: z.object({ deck_id: z.uuid(), changes: changesSchema }),
            annotations: readOnly,
            _meta: { securitySchemes: oauthSecurity },
          },
          ({ deck_id, changes }) =>
            run('preview_deck_change', { deck_id, changes }, async () => {
              const { data, error } = await supabase.rpc('preview_deck_change', { p_deck_id: deck_id, p_changes: changes })
              if (error) throw new Error(dbErrorText(error))
              return data
            }),
        )

        server.registerTool(
          'apply_deck_change',
          {
            title: 'Apply a deck change',
            description: 'Use only after preview_deck_change. Applies all listed card changes to one deck in a single transaction, or none. Fails if the deck revision changed since the preview. Reusing the same idempotency_key returns the first result.',
            inputSchema: z.object({
              deck_id: z.uuid(),
              expected_revision: z.number().int().min(1).describe('The revision returned by preview_deck_change.'),
              idempotency_key: z.string().min(1).max(64).describe('A new random string for each distinct change.'),
              summary: z.string().max(200).optional(),
              changes: changesSchema,
            }),
            annotations: deckWrite,
            _meta: { securitySchemes: oauthSecurity },
          },
          ({ deck_id, expected_revision, idempotency_key, summary, changes }) =>
            run('apply_deck_change', { deck_id, expected_revision, idempotency_key, summary, changes }, async () => {
              const { data, error } = await supabase.rpc('apply_deck_change', {
                p_deck_id: deck_id,
                p_expected_revision: expected_revision,
                p_changes: changes,
                p_idempotency_key: idempotency_key,
                p_summary: summary ?? null,
              })
              if (error) throw new Error(dbErrorText(error))
              return data
            }),
        )

        return server
      },
      { onerror: (error) => log({ event: 'mcp_handler_error', error: error.message, ...request, ...identity }) },
    )

    return handler.fetch(req)
  },
)

Deno.serve(async (incoming) => {
  const bodyText = incoming.method === 'POST' ? await incoming.text() : null
  const req = bodyText === null ? incoming : new Request(incoming.url, { method: incoming.method, headers: incoming.headers, body: bodyText })
  const request = describeRequest(req, bodyText)
  requestInfo.set(req, request)
  const started = Date.now()
  const response = await app(req)
  log({ ...request, event: 'mcp_http', status: response.status, ms: Date.now() - started })
  return response
})
