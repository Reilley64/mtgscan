import { SQL } from 'bun';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export const localStackUrl = url;

export async function asDatabaseOwner<T>(work: (database: SQL) => Promise<T>): Promise<T> {
  const database = new SQL(process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  try {
    return await work(database);
  } finally {
    await database.close();
  }
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

export function secretKeyClient(): AppClient {
  return createClient<Database>(url, localSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signUpNewUser(): Promise<TestUser> {
  const client = anonymousClient();
  const { data, error } = await client.auth.signUp({
    email: `${crypto.randomUUID()}@example.test`,
    password: crypto.randomUUID(),
  });
  if (error || !data.user) {
    throw error ?? new Error('Sign-up returned no user');
  }
  return { client, userId: data.user.id };
}
