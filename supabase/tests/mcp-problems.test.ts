import { describe, expect, test } from 'bun:test';

import { databaseFunctions } from '../database-functions';
import { beginMcpCallCodes, problemKinds } from '../functions/mcp/problems';
import { tools } from '../functions/mcp/tools';
import { asDatabaseOwner } from './local-stack';

const serverProblems = ['result-too-large', 'internal-error', 'request-too-large'];

const beginMcpCall = { name: 'begin_mcp_call', errorCodes: beginMcpCallCodes };
const contracts: { name: string; errorCodes: readonly string[] }[] = [...Object.values(databaseFunctions), beginMcpCall];
const aiClientFunctions: { name: string; errorCodes: readonly string[] }[] = [...tools.map(({ contract }) => contract), beginMcpCall];

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

function problemOf(code: string): string {
  return code.replaceAll('_', '-');
}

describe('MCP problems', () => {
  test("each database function's error codes are the codes it can raise", async () => {
    const bodies = await databaseFunctionBodies();

    const raised = contracts.map(({ name }) => ({ name, errorCodes: [...raisedCodes(bodies, `public.${name}`)].toSorted() }));

    expect(raised).toEqual(contracts.map(({ name, errorCodes }) => ({ name, errorCodes: errorCodes.toSorted() })));
  });

  test('every error code that a function AI clients call can raise has an MCP problem', async () => {
    const bodies = await databaseFunctionBodies();

    const withoutProblem = aiClientFunctions.flatMap(({ name }) =>
      [...raisedCodes(bodies, `public.${name}`)]
        .filter((code) => !(problemOf(code) in problemKinds))
        .map((code) => `${name}: ${code}`),
    );

    expect(withoutProblem).toEqual([]);
  });

  test('every MCP problem comes from an error code of a function AI clients call, or from the MCP server', () => {
    const raised = new Set(aiClientFunctions.flatMap(({ errorCodes }) => errorCodes.map(problemOf)));

    expect(Object.keys(problemKinds).filter((name) => !raised.has(name))).toEqual(serverProblems);
  });
});
