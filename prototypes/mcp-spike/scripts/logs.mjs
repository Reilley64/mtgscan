import { management, projectRef } from './lib.mjs'

const minutes = Number(process.argv[2] ?? 60)
const end = new Date()
const start = new Date(end.getTime() - minutes * 60 * 1000)
const sql = `select timestamp, event_message from logs where source = 'function_logs' and event_message like '%"event":"mcp_%' order by timestamp desc limit 200`
const query = new URLSearchParams({ sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() })
const data = await management('GET', `/v1/projects/${projectRef}/analytics/endpoints/logs?${query}`)
if (data.error) throw new Error(JSON.stringify(data.error))
for (const row of [...(data.result ?? [])].reverse()) {
  const message = String(row.event_message).trim()
  try {
    const event = JSON.parse(message)
    const fields = ['event', 'status', 'rpc_method', 'tool', 'result', 'error', 'protocol_version', 'user_agent', 'client_id', 'aud', 'reason']
    console.log(fields.filter((f) => event[f] !== undefined && event[f] !== null).map((f) => `${f}=${JSON.stringify(event[f])}`).join(' '), event.at ?? '')
  } catch {
    console.log(message)
  }
}
console.log(`${data.result?.length ?? 0} MCP log lines in the last ${minutes} minutes.`)
