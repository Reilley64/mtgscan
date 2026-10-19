import { describe, expect, test } from 'bun:test';

import { databaseFunctions } from '../database-functions';
import { asDatabaseOwner } from './local-stack';

describe('database function contracts', () => {
  test('every database function that a signed-in user can call with JSON has one contract', async () => {
    const rows = await asDatabaseOwner(
      (database) => database`
        select function.proname as name
        from pg_catalog.pg_proc function
        join pg_catalog.pg_namespace schema on schema.oid = function.pronamespace
        where schema.nspname = 'public'
          and pg_catalog.has_function_privilege('authenticated', function.oid, 'execute')
          and (function.prorettype = 'jsonb'::regtype or 'jsonb'::regtype = any (function.proargtypes))
        order by function.proname
      `,
    );

    expect(rows.map((row: { name: string }) => row.name)).toEqual(Object.keys(databaseFunctions).toSorted());
  });
});
