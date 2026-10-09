import type { AuthChangeEvent, AuthError, Session, User } from '@supabase/supabase-js';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export type FakeAccount = {
  provider: string;
  email: string;
};

let session: Session | null = null;
const googleAccount: FakeAccount = { provider: 'google', email: 'player@example.com' };
let nextSignInError: AuthError | null = null;
const listeners = new Set<AuthListener>();

function sessionFor(account: FakeAccount): Session {
  const user: User = {
    id: `user-${account.email}`,
    aud: 'authenticated',
    email: account.email,
    app_metadata: { provider: account.provider, providers: [account.provider] },
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  };
}

function notify(event: AuthChangeEvent) {
  listeners.forEach((listener) => listener(event, session));
}

export const fakeSupabase = {
  auth: {
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      void Promise.resolve().then(() => listener('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async startAutoRefresh() {},
    async stopAutoRefresh() {},
    async signInWithIdToken({ provider }: { provider: string; token: string }) {
      if (nextSignInError) {
        const error = nextSignInError;
        nextSignInError = null;
        return { data: { session: null, user: null }, error };
      }
      session = sessionFor({ ...googleAccount, provider });
      notify('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    },
    async signOut() {
      session = null;
      notify('SIGNED_OUT');
      return { error: null };
    },
  },
};

export function startSignedIn(account: FakeAccount = googleAccount) {
  session = sessionFor(account);
}

export function failNextSignIn(error: AuthError) {
  nextSignInError = error;
}

export function resetFakeSupabase() {
  session = null;
  nextSignInError = null;
  listeners.clear();
}
