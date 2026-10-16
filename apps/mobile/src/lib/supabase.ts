import type { Database } from '@mtgscan/supabase/database.types';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { supabasePublishableKey, supabaseUrl } from '@/lib/app-config';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, secureStoreOptions),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, secureStoreOptions),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, secureStoreOptions),
};

export const supabase = createClient<Database>(
  supabaseUrl(),
  supabasePublishableKey(),
  {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
