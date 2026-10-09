import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type User,
  type UserIdentity,
} from '@supabase/supabase-js';
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
let signInCount = 0;
const listeners = new Set<AuthListener>();
const users = new Map<string, User>();

function identityFor(user: User, provider: SignInProvider, signedInAt: string): UserIdentity {
  return {
    id: `${provider}-${user.email}`,
    identity_id: `${provider}-identity-${user.email}`,
    user_id: user.id,
    provider,
    identity_data: { email: user.email },
    created_at: signedInAt,
    last_sign_in_at: signedInAt,
    updated_at: signedInAt,
  };
}

function userSignedIn({ provider, email }: FakeAccount): User {
  const signedInAt = new Date(++signInCount * 1000).toISOString();
  const user = users.get(email) ?? {
    id: `user-${email}`,
    aud: 'authenticated',
    email,
    app_metadata: { provider, providers: [] },
    user_metadata: {},
    identities: [],
    created_at: signedInAt,
  };
  const otherIdentities = (user.identities ?? []).filter(
    (identity) => identity.provider !== provider,
  );
  const identities = [...otherIdentities, identityFor(user, provider, signedInAt)];
  const signedInUser: User = {
    ...user,
    app_metadata: { ...user.app_metadata, providers: identities.map(({ provider }) => provider) },
    identities,
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

export function resetFakeSupabase() {
  session = null;
  nextSignInEmail = defaultEmail;
  nextSignInError = null;
  signInCount = 0;
  listeners.clear();
  users.clear();
}
