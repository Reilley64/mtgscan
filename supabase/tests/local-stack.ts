import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export type AppClient = SupabaseClient<Database>;

export function anonymousClient(): AppClient {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signUpNewUser() {
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
