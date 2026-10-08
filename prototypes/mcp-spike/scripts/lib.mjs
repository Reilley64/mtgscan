import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRef = 'nowhpujqaptioyarqtbp'
export const projectUrl = `https://${projectRef}.supabase.co`
export const functionUrl = `${projectUrl}/functions/v1/mcp`
export const issuer = `${projectUrl}/auth/v1`
export const consentOrigin = 'http://localhost:3000'
export const spikeRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const localDir = join(spikeRoot, '.local')

export function readAccessToken() {
  const file = join(homedir(), '.config', 'mtgscan', 'supabase.env')
  if (!existsSync(file)) throw new Error(`Missing ${file}`)
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith('SUPABASE_ACCESS_TOKEN='))
  if (!line) throw new Error(`SUPABASE_ACCESS_TOKEN is not set in ${file}`)
  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
}

export async function management(method, path, body) {
  const response = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${readAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }
  return data
}

export function readLocalJson(name) {
  const file = join(localDir, name)
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run npm run setup first.`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function writeLocal(name, content, mode = 0o600) {
  mkdirSync(localDir, { recursive: true, mode: 0o700 })
  writeFileSync(join(localDir, name), content, { mode })
}

export function readOwnerLogin() {
  const text = readFileSync(join(localDir, 'owner-login.txt'), 'utf8')
  const value = (key) => text.split('\n').find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim()
  return { email: value('email'), password: value('password') }
}
