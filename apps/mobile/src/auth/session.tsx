import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';

const SessionContext = createContext<Session | null>(null);

function refreshWhileActive(state: AppStateStatus) {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshWhileActive(AppState.currentState);
    const subscription = AppState.addEventListener('change', refreshWhileActive);
    return () => subscription.remove();
  }, []);

  if (session === undefined) {
    return null;
  }

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession() {
  return use(SessionContext);
}
