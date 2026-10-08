import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { localDir, readLocalJson, readOwnerLogin, spikeRoot } from '../scripts/lib.mjs'

const port = Number(process.env.PORT ?? 3000)
const page = join(spikeRoot, 'consent', 'index.html')
const supabaseBundle = join(spikeRoot, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js')

function configScript() {
  const { projectUrl, publishableKey } = readLocalJson('config.json')
  const email = existsSync(join(localDir, 'owner-login.txt')) ? readOwnerLogin().email : ''
  return `window.spikeConfig = ${JSON.stringify({ projectUrl, publishableKey, email })}\n`
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`)
  try {
    if (pathname === '/oauth/consent') return send(res, 200, 'text/html; charset=utf-8', readFileSync(page))
    if (pathname === '/config.js') return send(res, 200, 'text/javascript; charset=utf-8', configScript())
    if (pathname === '/vendor/supabase.js') return send(res, 200, 'text/javascript; charset=utf-8', readFileSync(supabaseBundle))
    if (pathname === '/') {
      res.writeHead(302, { Location: '/oauth/consent' })
      return res.end()
    }
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found')
  } catch (error) {
    return send(res, 500, 'text/plain; charset=utf-8', String(error?.message ?? error))
  }
}).listen(port, () => {
  console.log(`Consent page: http://localhost:${port}/oauth/consent`)
})
