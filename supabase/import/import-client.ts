import { createClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { supabaseUrlOf } from '../test-user/account';
import type { ImportClient } from './import-run';

export function importClientFromEnvironment(): ImportClient {
  const url = supabaseUrlOf(process.env);
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Set SUPABASE_URL or SUPABASE_PROJECT_REF, and SUPABASE_SECRET_KEY.');
    process.exit(2);
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
