import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { consentOrigin, localDir, management, projectRef, projectUrl, readOwnerLogin, spikeRoot, writeLocal } from './lib.mjs'

const ownerEmail = process.env.SPIKE_OWNER_EMAIL ?? 'reilley@arctopayments.com.au'
const migrationFile = join(spikeRoot, 'supabase', 'migrations', '20261008000000_mcp_spike.sql')

async function configureAuth() {
  await management('PATCH', `/v1/projects/${projectRef}/config/auth`, {
    site_url: consentOrigin,
    external_email_enabled: true,
    oauth_server_enabled: true,
    oauth_server_allow_dynamic_registration: true,
    oauth_server_authorization_path: '/oauth/consent',
  })
  const auth = await management('GET', `/v1/projects/${projectRef}/config/auth`)
  const keys = ['site_url', 'external_email_enabled', 'oauth_server_enabled', 'oauth_server_allow_dynamic_registration', 'oauth_server_authorization_path']
  console.log('Auth config:', JSON.stringify(Object.fromEntries(keys.map((k) => [k, auth[k]]))))
}

async function applyMigration() {
  await management('POST', `/v1/projects/${projectRef}/database/query`, { query: readFileSync(migrationFile, 'utf8') })
  console.log('Migration applied:', migrationFile)
}

async function fetchKeys() {
  const keys = await management('GET', `/v1/projects/${projectRef}/api-keys?reveal=true`)
  const publishable = keys.find((k) => k.type === 'publishable' && k.name === 'default')
  const secret = keys.find((k) => k.type === 'secret' && k.name === 'default')
  if (!publishable?.api_key || !secret?.api_key) throw new Error('The default publishable or secret API key is missing.')
  writeLocal('config.json', JSON.stringify({ projectUrl, publishableKey: publishable.api_key }, null, 2) + '\n')
  writeLocal('secret.json', JSON.stringify({ secretKey: secret.api_key }, null, 2) + '\n')
  console.log('API keys written to .local/config.json and .local/secret.json')
  return { publishableKey: publishable.api_key, secretKey: secret.api_key }
}

async function ensureOwner(admin) {
  const loginFile = join(localDir, 'owner-login.txt')
  const known = existsSync(loginFile) ? readOwnerLogin() : null
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase())
  if (existing && known?.password && known.email === ownerEmail) {
    console.log('Owner user already exists:', ownerEmail)
    return known
  }
  const password = randomBytes(18).toString('base64url')
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    if (error) throw error
    console.log('Owner user existed. Password reset:', ownerEmail)
  } else {
    const { error } = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
    if (error) throw error
    console.log('Owner user created:', ownerEmail)
  }
  writeLocal('owner-login.txt', `email: ${ownerEmail}\npassword: ${password}\nconsent page: ${consentOrigin}/oauth/consent\n`)
  console.log('Owner login written to .local/owner-login.txt')
  return { email: ownerEmail, password }
}

async function seed(publishableKey, login) {
  const client = createClient(projectUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInError } = await client.auth.signInWithPassword(login)
  if (signInError) throw signInError
  const { data, error } = await client.rpc('seed_spike_data')
  if (error) throw error
  console.log('Seed:', JSON.stringify(data))
  await client.auth.signOut()
}

await configureAuth()
await applyMigration()
const { publishableKey, secretKey } = await fetchKeys()
const admin = createClient(projectUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await ensureOwner(admin)
await seed(publishableKey, login)
