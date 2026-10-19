import { SQL, type TransactionSQL } from 'bun';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { localSupabaseUrl } from '../test-user/account';

const url = process.env.SUPABASE_URL ?? localSupabaseUrl;
export const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export const localStackUrl = url;

const databaseUrl =
  process.env.SUPABASE_DB_URL ?? `postgresql://postgres:postgres@127.0.0.1:${process.env.SUPABASE_DB_PORT ?? 54322}/postgres`;

async function asDatabaseUser<T>(url: string, work: (database: SQL) => Promise<T>): Promise<T> {
  const database = new SQL(url);
  try {
    return await work(database);
  } finally {
    await database.close();
  }
}

export function asDatabaseOwner<T>(work: (database: SQL) => Promise<T>): Promise<T> {
  return asDatabaseUser(databaseUrl, work);
}

export function asAuthAdmin<T>(work: (database: SQL) => Promise<T>): Promise<T> {
  const url = new URL(databaseUrl);
  url.username = 'supabase_auth_admin';
  return asDatabaseUser(url.toString(), work);
}

export async function asDatabaseRole<T>(
  role: 'anon' | 'authenticated' | 'deck_evaluator' | 'catalog_importer',
  claims: Record<string, string | string[]>,
  work: (database: TransactionSQL) => Promise<T>,
): Promise<T> {
  return asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      await transaction`select set_config('role', ${role}, true)`;
      await transaction`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      return work(transaction);
    }),
  );
}

export function asSignedInUser<T>(user: { userId: string }, work: (database: SQL) => Promise<T>): Promise<T> {
  return asDatabaseRole('authenticated', { sub: user.userId, role: 'authenticated' }, work);
}

export function asAnonymousCaller<T>(work: (database: SQL) => Promise<T>): Promise<T> {
  return asDatabaseRole('anon', { role: 'anon' }, work);
}

export function localSecretKey(): string {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Set SUPABASE_SECRET_KEY to the SECRET_KEY value from `supabase status -o env`.');
  }
  return secretKey;
}

export type AppClient = SupabaseClient<Database>;

export type TestUser = {
  client: AppClient;
  userId: string;
};

export function anonymousClient(): AppClient {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tokenClient(token: string): AppClient {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function secretKeyClient(): AppClient {
  return createClient<Database>(url, localSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signUpNewUser(): Promise<TestUser> {
  const account = { email: `${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() };
  const created = await secretKeyClient().auth.admin.createUser({ ...account, email_confirm: true });
  if (created.error) {
    throw created.error;
  }
  const client = anonymousClient();
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error || !data.user) {
    throw error ?? new Error('Sign-in returned no user');
  }
  return { client, userId: data.user.id };
}
