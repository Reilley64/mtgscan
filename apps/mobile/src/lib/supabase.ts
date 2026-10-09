import type { Database } from '@mtgscan/supabase/database.types';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const keychainOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychainSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, keychainOptions),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, keychainOptions),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, keychainOptions),
};

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: keychainSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
