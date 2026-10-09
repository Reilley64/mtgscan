import { beforeAll, describe, expect, test } from 'bun:test';

import { anonymousClient, signUpNewUser, type TestUser } from './local-stack';

const permissionDenied = '42501';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  bob = await signUpNewUser();
});

test("signing up creates the user's profile", async () => {
  const { data, error } = await alice.client.from('profiles').select('user_id');

  expect(error).toBeNull();
  expect(data).toEqual([{ user_id: alice.userId }]);
});

test("a user never reads another user's profile", async () => {
  const { data, error } = await bob.client
    .from('profiles')
    .select('user_id')
    .eq('user_id', alice.userId);

  expect(error).toBeNull();
  expect(data).toEqual([]);
});

test('an anonymous caller reads no profiles', async () => {
  const { data } = await anonymousClient().from('profiles').select('user_id');

  expect(data ?? []).toEqual([]);
});

describe('direct writes to profiles are refused', () => {
  test('insert', async () => {
    const { error } = await alice.client.from('profiles').insert({ user_id: alice.userId });

    expect(error?.code).toBe(permissionDenied);
  });

  test('update', async () => {
    const { error } = await alice.client
      .from('profiles')
      .update({ created_at: new Date(0).toISOString() })
      .eq('user_id', alice.userId);

    expect(error?.code).toBe(permissionDenied);
  });

  test('delete', async () => {
    const { error } = await alice.client.from('profiles').delete().eq('user_id', alice.userId);

    expect(error?.code).toBe(permissionDenied);
  });

  test('anonymous insert', async () => {
    const { error } = await anonymousClient().from('profiles').insert({ user_id: bob.userId });

    expect(error?.code).toBe(permissionDenied);
  });
});
