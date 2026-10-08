import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { consentOrigin, functionUrl, issuer, projectUrl, readLocalJson, readOwnerLogin } from './lib.mjs'

const keepClients = process.argv.includes('--keep-clients')
const writeTest = process.argv.includes('--write')
const redirectUri = 'http://localhost:8976/callback'
const requestedScope = 'openid email profile phone offline_access'
const rows = []
const createdClients = []

function record(check, pass, detail, kind) {
  rows.push({ check, result: kind ?? (pass ? 'PASS' : 'FAIL'), detail })
}

function base64url(buffer) {
  return buffer.toString('base64url')
}

function claimsOf(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 300) }
  }
}

async function mcp(token, body, protocolVersion) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': 'mtgscan-spike-preflight' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion
  const response = await fetch(functionUrl, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await response.text()
  let message = null
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())
    message = data.length ? JSON.parse(data[data.length - 1]) : null
  } else if (text) {
    try {
      message = JSON.parse(text)
    } catch {
      message = { raw: text.slice(0, 300) }
    }
  }
  return { status: response.status, headers: response.headers, message }
}

function toolText(result) {
  return result?.message?.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(result?.message?.error ?? result?.message)
}

function toolJson(result) {
  try {
    return JSON.parse(toolText(result))
  } catch {
    return null
  }
}

async function discovery() {
  const unauth = await mcp(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'preflight', version: '0' } } })
  const challenge = unauth.headers.get('www-authenticate') ?? ''
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1]
  record('Unauthenticated POST returns 401 with resource_metadata', unauth.status === 401 && Boolean(metadataUrl), `status ${unauth.status}, WWW-Authenticate: ${challenge || 'missing'}`)
  if (!metadataUrl) return null

  const prm = await readJson(await fetch(metadataUrl))
  record('PRM resource equals the function URL', prm.resource === functionUrl, `resource ${prm.resource}`)

  const issuerUrl = new URL(prm.authorization_servers?.[0] ?? issuer)
  const asMetadataUrl = `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname}`
  const as = await readJson(await fetch(asMetadataUrl))
  record('PRM authorization_servers[0] equals the AS issuer', prm.authorization_servers?.[0] === as.issuer, `PRM ${prm.authorization_servers?.[0]}, AS issuer ${as.issuer}`)
  record('AS metadata lists S256', as.code_challenge_methods_supported?.includes('S256'), `code_challenge_methods_supported ${JSON.stringify(as.code_challenge_methods_supported)}`)
  record('AS metadata lists offline_access', as.scopes_supported?.includes('offline_access'), `scopes_supported ${JSON.stringify(as.scopes_supported)}`)
  record('AS metadata has registration_endpoint', Boolean(as.registration_endpoint), as.registration_endpoint ?? 'missing')
  record('AS metadata advertises CIMD', as.client_id_metadata_document_supported === true, `client_id_metadata_document_supported ${as.client_id_metadata_document_supported ?? 'absent'}`, 'INFO')
  record('AS metadata advertises RFC 9207 iss', as.authorization_response_iss_parameter_supported === true, `authorization_response_iss_parameter_supported ${as.authorization_response_iss_parameter_supported ?? 'absent'}`, 'INFO')
  return as
}

async function oauthFlow(as, owner, kind) {
  const label = `${kind} client`
  const registration = await fetch(as.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: `mtgscan preflight ${kind}`,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: kind === 'public' ? 'none' : 'client_secret_basic',
    }),
  })
  const client = await readJson(registration)
  if (client.client_id) createdClients.push(client.client_id)
  const registered = registration.ok && Boolean(client.client_id) && (kind === 'public' || Boolean(client.client_secret))
  record(`${label}: DCR registration`, registered, `status ${registration.status}, token_endpoint_auth_method ${client.token_endpoint_auth_method ?? 'n/a'}, client_type ${client.client_type ?? 'n/a'}${client.error ? `, ${client.error}: ${client.error_description}` : ''}`)
  if (!registered) return null

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const authorizeUrl = new URL(as.authorization_endpoint)
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: requestedScope,
    state: base64url(randomBytes(12)),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: functionUrl,
  }).toString()
  const authorize = await fetch(authorizeUrl, { redirect: 'manual' })
  const location = authorize.headers.get('location') ?? ''
  const consentUrl = location ? new URL(location, as.authorization_endpoint) : null
  const authorizationId = consentUrl?.searchParams.get('authorization_id')
  const toConsent = authorize.status >= 300 && authorize.status < 400 && consentUrl?.origin === consentOrigin && consentUrl.pathname === '/oauth/consent' && Boolean(authorizationId)
  const authorizeBody = toConsent ? '' : JSON.stringify(await readJson(authorize)).slice(0, 200)
  record(`${label}: #2820 /oauth/authorize redirects to consent page`, toConsent, `status ${authorize.status}, location ${consentUrl ? `${consentUrl.origin}${consentUrl.pathname}` : 'none'} ${authorizeBody}`)
  if (!toConsent) return null

  const { data: details, error: detailsError } = await owner.auth.oauth.getAuthorizationDetails(authorizationId)
  record(`${label}: #2820 consent page gets authorization details`, !detailsError && Boolean(details), detailsError ? `status ${detailsError.status}, ${detailsError.code ?? ''} ${detailsError.message}` : `client ${details.client?.name}, scope "${details.scope}"`)
  if (detailsError) return null

  const { data: approval, error: approvalError } = await owner.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
  const callback = approval?.redirect_url ? new URL(approval.redirect_url) : null
  const code = callback?.searchParams.get('code')
  record(`${label}: approve returns a code`, !approvalError && Boolean(code), approvalError ? `status ${approvalError.status}, ${approvalError.message}` : `redirect ${callback?.origin}${callback?.pathname}, iss ${callback?.searchParams.get('iss') ?? 'absent'}`)
  if (!code) return null

  const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const tokenBody = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, resource: functionUrl })
  if (kind === 'public') tokenBody.set('client_id', client.client_id)
  else tokenHeaders.Authorization = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')}`
  const tokenResponse = await fetch(as.token_endpoint, { method: 'POST', headers: tokenHeaders, body: tokenBody })
  const tokens = await readJson(tokenResponse)
  const claims = tokens.access_token ? claimsOf(tokens.access_token) : null
  record(`${label}: token exchange with resource and PKCE`, tokenResponse.ok && Boolean(tokens.access_token), tokenResponse.ok ? `aud ${JSON.stringify(claims?.aud)}, client_id ${claims?.client_id === client.client_id ? 'matches' : claims?.client_id}, iss ${claims?.iss}, expires_in ${tokens.expires_in}` : `status ${tokenResponse.status}, ${JSON.stringify(tokens).slice(0, 200)}`)
  record(`${label}: refresh token issued`, Boolean(tokens.refresh_token), tokens.refresh_token ? `scope "${tokens.scope ?? ''}"` : 'no refresh_token in token response')
  if (!tokens.access_token) return null

  if (tokens.refresh_token) {
    const refreshBody = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: functionUrl })
    if (kind === 'public') refreshBody.set('client_id', client.client_id)
    const refreshResponse = await fetch(as.token_endpoint, { method: 'POST', headers: tokenHeaders, body: refreshBody })
    const refreshed = await readJson(refreshResponse)
    record(`${label}: refresh grant works`, refreshResponse.ok && Boolean(refreshed.access_token), refreshResponse.ok ? `new access token for client_id ${claimsOf(refreshed.access_token)?.client_id === client.client_id ? 'matches' : 'differs'}` : `status ${refreshResponse.status}, ${JSON.stringify(refreshed).slice(0, 200)}`)
    if (refreshed.access_token) return refreshed.access_token
  }
  return tokens.access_token
}

async function mcpChecks(token) {
  const protocol = '2025-06-18'
  const init = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'preflight', version: '0' } } })
  record('MCP initialize with OAuth token', init.status === 200 && Boolean(init.message?.result), init.message?.result ? `status ${init.status}, server ${init.message.result.serverInfo?.name}, protocol ${init.message.result.protocolVersion}` : `status ${init.status}, ${JSON.stringify(init.message).slice(0, 300)}`)

  const list = await mcp(token, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, protocol)
  const tools = list.message?.result?.tools ?? []
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
  const expected = ['search_collection', 'get_deck', 'preview_deck_change', 'apply_deck_change']
  record('MCP tools/list returns the four tools', expected.every((name) => byName[name]), `tools ${tools.map((t) => t.name).join(', ')}`)
  const write = byName.apply_deck_change?.annotations ?? {}
  record('apply_deck_change annotations', write.readOnlyHint === false && write.destructiveHint === true && write.idempotentHint === true && write.openWorldHint === false, JSON.stringify(write))
  const reads = ['search_collection', 'get_deck', 'preview_deck_change'].every((name) => byName[name]?.annotations?.readOnlyHint === true)
  record('Read tools have readOnlyHint true', reads, ['search_collection', 'get_deck', 'preview_deck_change'].map((n) => `${n} ${byName[n]?.annotations?.readOnlyHint}`).join(', '))

  const search = await mcp(token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_collection', arguments: { query: 'Sol' } } }, protocol)
  const found = toolJson(search)
  record('search_collection("Sol")', Boolean(found?.cards?.length) && !search.message?.result?.isError, found?.cards ? found.cards.map((c) => `${c.card_name} x${c.qty}`).join(', ') : toolText(search))

  const deckCall = await mcp(token, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_deck', arguments: {} } }, protocol)
  const deck = toolJson(deckCall)
  record('get_deck() without deck_id', Boolean(deck?.id && deck?.revision), deck?.id ? `${deck.name}, revision ${deck.revision}, ${deck.card_count} cards` : toolText(deckCall))
  if (!deck?.id) return

  const changes = [{ op: 'remove', card_name: 'Sol Ring', quantity: 1 }, { op: 'add', card_name: 'Arcane Signet', quantity: 1 }]
  const previewCall = await mcp(token, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'preview_deck_change', arguments: { deck_id: deck.id, changes } } }, protocol)
  const preview = toolJson(previewCall)
  record('preview_deck_change (Sol Ring out, Arcane Signet in)', preview?.ok === true, preview?.lines ? `ok ${preview.ok}, revision ${preview.revision}, ${JSON.stringify(preview.lines)}, errors ${JSON.stringify(preview.errors)}` : toolText(previewCall))

  const staleCall = await mcp(token, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'apply_deck_change', arguments: { deck_id: deck.id, expected_revision: deck.revision + 100, idempotency_key: `preflight-stale-${Date.now()}`, changes } } }, protocol)
  const after = toolJson(await mcp(token, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_deck', arguments: { deck_id: deck.id } } }, protocol))
  const staleRejected = staleCall.message?.result?.isError === true && toolText(staleCall).includes('stale_revision')
  record('apply_deck_change with stale revision is rejected and changes nothing', staleRejected && after?.revision === deck.revision, `${toolText(staleCall).slice(0, 160)}; revision still ${after?.revision}`)

  if (!writeTest) return

  const key = `preflight-write-${Date.now()}`
  const applyArgs = { deck_id: deck.id, expected_revision: deck.revision, idempotency_key: key, summary: 'Pre-flight write test', changes }
  const applied = toolJson(await mcp(token, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'apply_deck_change', arguments: applyArgs } }, protocol))
  record('apply_deck_change applies both lines and bumps the revision', applied?.status === 'applied' && applied.revision_after === deck.revision + 1, applied ? `revision ${applied.revision_before} to ${applied.revision_after}, log_id ${applied.log_id}, ${JSON.stringify(applied.lines)}` : 'no result')
  const replay = toolJson(await mcp(token, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'apply_deck_change', arguments: applyArgs } }, protocol))
  record('apply_deck_change replay with the same idempotency_key', replay?.replayed === true && replay.revision_after === applied?.revision_after, replay ? `replayed ${replay.replayed}, revision_after ${replay.revision_after}` : 'no result')
  const undoChanges = [{ op: 'add', card_name: 'Sol Ring', quantity: 1 }, { op: 'remove', card_name: 'Arcane Signet', quantity: 1 }]
  const undone = toolJson(await mcp(token, { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'apply_deck_change', arguments: { deck_id: deck.id, expected_revision: applied?.revision_after ?? 0, idempotency_key: `${key}-undo`, summary: 'Pre-flight undo', changes: undoChanges } } }, protocol))
  record('apply_deck_change undo restores the cards', undone?.status === 'applied', undone ? `revision ${undone.revision_before} to ${undone.revision_after}` : 'no result')
}

async function tokenWithoutClientId(owner) {
  const { data } = await owner.auth.getSession()
  const token = data.session?.access_token
  const claims = token ? claimsOf(token) : null
  const result = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '2025-06-18')
  record('Password-grant token without client_id is rejected', result.status === 401 && !claims?.client_id, `status ${result.status}, token client_id ${claims?.client_id ?? 'absent'}`)
}

async function cleanup() {
  if (keepClients || createdClients.length === 0) return
  try {
    const { secretKey } = readLocalJson('secret.json')
    const admin = createClient(projectUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    for (const id of createdClients) {
      const { error } = await admin.auth.admin.oauth.deleteClient(id)
      if (error) record('Delete preflight DCR client', false, `${id}: ${error.message}`)
    }
  } catch (error) {
    record('Delete preflight DCR clients', false, String(error.message ?? error))
  }
}

function printTable() {
  const width = Math.max(...rows.map((r) => r.check.length))
  console.log(`\n${'Check'.padEnd(width)} | Result | Detail`)
  console.log(`${'-'.repeat(width)} | ------ | ------`)
  for (const row of rows) console.log(`${row.check.padEnd(width)} | ${row.result.padEnd(6)} | ${row.detail}`)
  const failed = rows.filter((r) => r.result === 'FAIL').length
  console.log(`\n${rows.filter((r) => r.result === 'PASS').length} passed, ${failed} failed, ${rows.filter((r) => r.result === 'INFO').length} info.`)
  return failed
}

const { publishableKey } = readLocalJson('config.json')
const owner = createClient(projectUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: signInError } = await owner.auth.signInWithPassword(readOwnerLogin())
record('Owner signs in with email and password', !signInError, signInError ? signInError.message : 'ok')

try {
  const as = await discovery()
  if (as?.registration_endpoint && !signInError) {
    const publicToken = await oauthFlow(as, owner, 'public')
    await oauthFlow(as, owner, 'confidential')
    if (publicToken) await mcpChecks(publicToken)
    await tokenWithoutClientId(owner)
  }
} catch (error) {
  record('Pre-flight script error', false, String(error?.stack ?? error).slice(0, 300))
} finally {
  await cleanup()
}

process.exitCode = printTable() > 0 ? 1 : 0
