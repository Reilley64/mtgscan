import { describe, expect, test } from 'bun:test';

import { beginMcpCallCodes } from '../functions/mcp/problems';
import { tools } from '../functions/mcp/tools';
import { asDatabaseOwner } from './local-stack';

const aiClientFunctions = [
  ...tools.map(({ contract }) => ({ name: contract.name as string, problemCodes: contract.errorCodes as readonly string[] })),
  { name: 'begin_mcp_call', problemCodes: beginMcpCallCodes },
];

async function databaseFunctionBodies(): Promise<Map<string, string>> {
  const rows: { name: string; body: string }[] = await asDatabaseOwner(
    (database) => database`
      select schema.nspname || '.' || function.proname as name, string_agg(function.prosrc, ' ') as body
      from pg_catalog.pg_proc function
      join pg_catalog.pg_namespace schema on schema.oid = function.pronamespace
      where schema.nspname in ('public', 'private')
      group by 1
    `,
  );
  return new Map(rows.map(({ name, body }) => [name, body]));
}

function raisedCodes(bodies: Map<string, string>, name: string, seen = new Set<string>()): Set<string> {
  const body = bodies.get(name);
  if (body === undefined || seen.has(name)) {
    return new Set();
  }
  seen.add(name);
  const codes = new Set([...body.matchAll(/raise_search_error\(\s*'(\w+)'/g)].map(([, code]) => code!));
  for (const [, callee] of body.matchAll(/\b((?:public|private)\.\w+)\s*\(/g)) {
    for (const code of raisedCodes(bodies, callee!, seen)) {
      codes.add(code);
    }
  }
  return codes;
}

describe('MCP problems', () => {
  test('every error code that a function AI clients call can raise has an MCP problem', async () => {
    const bodies = await databaseFunctionBodies();

    const withoutProblem = aiClientFunctions.flatMap(({ name, problemCodes }) =>
      [...raisedCodes(bodies, `public.${name}`)].filter((code) => !problemCodes.includes(code)).map((code) => `${name}: ${code}`),
    );

    expect(withoutProblem).toEqual([]);
  });
});
