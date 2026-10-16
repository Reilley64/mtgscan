import { describe, expect, test } from 'bun:test';

import { asDatabaseOwner } from './local-stack';

class RolledBack extends Error {}

describe('private functions', () => {
  test('no private function is executable by PUBLIC or anon', async () => {
    const open = await asDatabaseOwner(
      (database) => database`
        select p.oid::regprocedure::text as name, grantee.role
        from pg_proc p
        cross join unnest(array['public', 'anon']) grantee(role)
        where p.pronamespace = 'private'::regnamespace
          and has_function_privilege(grantee.role, p.oid, 'execute')
        order by name, grantee.role
      `,
    );

    expect([...open]).toEqual([]);
  });

  test('a private function that a later migration creates starts closed to every app role', async () => {
    let executableBy: string[] = [];

    const created = asDatabaseOwner((database) =>
      database.begin(async (transaction) => {
        await transaction`create function private.later_helper() returns integer language sql set search_path = '' as 'select 1'`;
        const rows = await transaction`
          select grantee.role
          from unnest(array['public', 'anon', 'authenticated', 'service_role', 'catalog_importer', 'deck_evaluator']) grantee(role)
          where has_function_privilege(grantee.role, 'private.later_helper()', 'execute')
        `;
        executableBy = rows.map((row: { role: string }) => row.role);
        throw new RolledBack();
      }),
    );

    await expect(created).rejects.toBeInstanceOf(RolledBack);
    expect(executableBy).toEqual([]);
  });
});
