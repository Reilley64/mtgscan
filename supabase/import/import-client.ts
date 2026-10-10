import { createClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import type { ImportClient } from './import-run';

export function importClientFromEnvironment(): ImportClient {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
    process.exit(2);
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
