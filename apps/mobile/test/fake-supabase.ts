import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import type { CollectionPrintingRow, CollectionPrintingsQuery } from '@mtgscan/supabase/collection';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

import type { SignInProvider } from '@/auth/sign-in';

import { appleIdTokenNonce } from './fake-apple';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export type FakeAccount = {
  provider: SignInProvider;
  email: string;
};

const defaultEmail = 'player@example.com';
let session: Session | null = null;
let nextSignInEmail = defaultEmail;
let nextSignInError: AuthError | null = null;
const listeners = new Set<AuthListener>();
const users = new Map<string, User>();
let collectionPrintings: CollectionPrintingRow[] = [];
let failingCollectionReads = 0;

const issuers: Record<SignInProvider, string> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
};

function userSignedIn({ provider, email }: FakeAccount): User {
  const user = users.get(email) ?? {
    id: `user-${email}`,
    aud: 'authenticated',
    email,
    app_metadata: { provider, providers: [] },
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
  const providers: string[] = user.app_metadata.providers ?? [];
  const signedInUser: User = {
    ...user,
    app_metadata: {
      ...user.app_metadata,
      providers: providers.includes(provider) ? providers : [...providers, provider],
    },
    user_metadata: { ...user.user_metadata, iss: issuers[provider], email },
  };
  users.set(email, signedInUser);
  return signedInUser;
}

function sessionFor(account: FakeAccount): Session {
  const user = userSignedIn(account);
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  };
}

async function nonceMatches(provider: SignInProvider, token: string, nonce: string | undefined) {
  if (provider !== 'apple') {
    return true;
  }
  return (
    nonce !== undefined &&
    appleIdTokenNonce(token) === (await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce))
  );
}

function collectionPrintingsPage({ cursor, limit = 60 }: CollectionPrintingsQuery) {
  if (failingCollectionReads > 0) {
    failingCollectionReads -= 1;
    return { data: null, error: { code: 'PGRST000', message: 'Network request failed', details: null } };
  }
  const start = cursor ? Number(cursor) : 0;
  const end = start + limit;
  return {
    data: {
      items: collectionPrintings.slice(start, end),
      next_cursor: end < collectionPrintings.length ? String(end) : null,
    },
    error: null,
  };
}

function notify(event: AuthChangeEvent) {
  listeners.forEach((listener) => listener(event, session));
}

export const fakeSupabase = {
  async rpc(name: string, { query }: { query: CollectionPrintingsQuery }) {
    if (name !== 'list_collection_printings') {
      throw new Error(`The fake Supabase client has no ${name} function`);
    }
    return collectionPrintingsPage(query);
  },
  auth: {
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      void Promise.resolve().then(() => listener('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async startAutoRefresh() {},
    async stopAutoRefresh() {},
    async signInWithIdToken({
      provider,
      token,
      nonce,
    }: {
      provider: SignInProvider;
      token: string;
      nonce?: string;
    }) {
      if (!(await nonceMatches(provider, token, nonce))) {
        const error = new AuthApiError('Nonces mismatch', 400, 'bad_jwt');
        return { data: { session: null, user: null }, error };
      }
      if (nextSignInError) {
        const error = nextSignInError;
        nextSignInError = null;
        return { data: { session: null, user: null }, error };
      }
      session = sessionFor({ provider, email: nextSignInEmail });
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

export function startSignedIn(account: FakeAccount = { provider: 'google', email: defaultEmail }) {
  session = sessionFor(account);
}

export function signInNextWithEmail(email: string) {
  nextSignInEmail = email;
}

export function failNextSignIn(error: AuthError) {
  nextSignInError = error;
}

export function ownCollectionPrintings(printings: CollectionPrintingRow[]) {
  collectionPrintings = printings;
}

export function failCollectionReads(count: number) {
  failingCollectionReads = count;
}

export function resetFakeSupabase() {
  session = null;
  collectionPrintings = [];
  failingCollectionReads = 0;
  nextSignInEmail = defaultEmail;
  nextSignInError = null;
  listeners.clear();
  users.clear();
}
