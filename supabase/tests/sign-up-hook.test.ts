import { beforeEach, describe, expect, test } from 'bun:test';

import { testUser } from '../test-user/account';
import { anonymousClient, asDatabaseOwner, secretKeyClient } from './local-stack';

async function removeTestUser() {
  const admin = secretKeyClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(error).toBeNull();
  const user = data.users.find((candidate) => candidate.email === testUser.email);
  if (user) {
    expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
}

function signUpEvent(provider: string, email: string) {
  return {
    metadata: { uuid: crypto.randomUUID(), time: new Date().toISOString(), name: 'before-user-created', ip_address: '127.0.0.1' },
    user: {
      id: crypto.randomUUID(),
      aud: 'authenticated',
      role: '',
      email,
      phone: '',
      app_metadata: { provider, providers: [provider] },
      user_metadata: {},
      identities: [],
      created_at: '0001-01-01T00:00:00Z',
      updated_at: '0001-01-01T00:00:00Z',
      is_anonymous: false,
    },
  };
}

function hookAnswer(provider: string, email: string) {
  return asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      await transaction`set local role supabase_auth_admin`;
      const [{ answer }] = await transaction`select public.limit_email_sign_ups(${signUpEvent(provider, email)}::jsonb) as answer`;
      return answer;
    }),
  );
}

describe('the sign-up hook', () => {
  beforeEach(removeTestUser);

  test('refuses an email sign-up other than the test email', async () => {
    const email = `${crypto.randomUUID()}@example.test`;

    const { data, error } = await anonymousClient().auth.signUp({ email, password: crypto.randomUUID() });

    expect(error?.status).toBe(403);
    expect(error?.message).toBe('Sign up with Apple or Google.');
    expect(data.user).toBeNull();
    const { data: users } = await secretKeyClient().auth.admin.listUsers({ perPage: 1000 });
    expect(users.users.some((user) => user.email === email)).toBe(false);
  });

  test('allows an email sign-up with the test email', async () => {
    const { data, error } = await anonymousClient().auth.signUp({ email: testUser.email, password: testUser.password });

    expect(error).toBeNull();
    expect(data.user?.email).toBe(testUser.email);
  });

  test.each(['apple', 'google'])('allows a %s sign-up with any email', async (provider) => {
    expect(await hookAnswer(provider, `${crypto.randomUUID()}@example.test`)).toEqual({});
  });
});
