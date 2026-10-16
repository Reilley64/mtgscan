import {
  AuthApiError,
  type AuthError,
  AuthRetryableFetchError,
  type OAuthAuthorizationDetails,
  type Session,
} from '@supabase/supabase-js';

import type { ConsentAuth } from '../oauth/consent/consent-page';

export const consentPageUrl = 'https://mtgscan.reilley.dev/oauth/consent';
export const authorizationId = 'authorization-1';

export const chatGptDetails: OAuthAuthorizationDetails = {
  authorization_id: authorizationId,
  redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  client: { id: 'client-1', name: 'ChatGPT', uri: '', logo_uri: '' },
  user: { id: 'user-1', email: 'player@example.com' },
  scope: 'email',
};

export const approvedRedirect = 'https://chatgpt.com/connector_platform_oauth_redirect?code=code-1&state=state-1';
export const deniedRedirect = 'https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=state-1';

export const authorizationNotFound = new AuthApiError('authorization not found', 404, 'oauth_authorization_not_found');
export const authorizationNotPending = new AuthApiError(
  'authorization request is no longer pending',
  400,
  'validation_failed',
);
export const sessionRejected = new AuthApiError('invalid JWT', 401, 'bad_jwt');
export const sessionNotFound = new AuthApiError(
  'Session from session_id claim in JWT does not exist',
  403,
  'session_not_found',
);
export const unreachable = new AuthRetryableFetchError('Failed to fetch', 0);

function session(
  app_metadata: Session['user']['app_metadata'],
  user_metadata: Session['user']['user_metadata'],
): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'user-1',
      aud: 'authenticated',
      email: 'player@example.com',
      app_metadata,
      user_metadata,
      created_at: '2026-10-16T00:00:00Z',
    },
  };
}

export function googleSession() {
  return session({ provider: 'google' }, { iss: 'https://accounts.google.com' });
}

export function appleSession() {
  return session({ provider: 'apple' }, { iss: 'https://appleid.apple.com' });
}

type FakeAuthOptions = {
  session?: Session;
  details?: OAuthAuthorizationDetails | { redirect_url: string };
  failures?: Partial<Record<'signIn' | 'details' | 'approve' | 'deny', AuthError[]>>;
};

export function fakeAuth({ session, details = chatGptDetails, failures = {} }: FakeAuthOptions = {}) {
  const calls = {
    signIns: [] as Parameters<ConsentAuth['signInWithOAuth']>[0][],
    signOuts: [] as Parameters<ConsentAuth['signOut']>[0][],
    details: [] as string[],
    approvals: [] as string[],
    denials: [] as string[],
  };
  let currentSession = session ?? null;

  const auth: ConsentAuth = {
    async getSession() {
      return currentSession
        ? { data: { session: currentSession }, error: null }
        : { data: { session: null }, error: null };
    },
    async signInWithOAuth(credentials) {
      calls.signIns.push(credentials);
      const error = failures.signIn?.shift();
      if (error) return { data: { provider: credentials.provider, url: null }, error };
      return {
        data: {
          provider: credentials.provider,
          url: `https://supabase.test/auth/v1/authorize?provider=${credentials.provider}`,
        },
        error: null,
      };
    },
    async signOut(options) {
      calls.signOuts.push(options);
      currentSession = null;
      return { error: null };
    },
    oauth: {
      async getAuthorizationDetails(id) {
        calls.details.push(id);
        const error = failures.details?.shift();
        if (error) return { data: null, error };
        return { data: details, error: null };
      },
      async approveAuthorization(id) {
        calls.approvals.push(id);
        const error = failures.approve?.shift();
        if (error) return { data: null, error };
        return { data: { redirect_url: approvedRedirect }, error: null };
      },
      async denyAuthorization(id) {
        calls.denials.push(id);
        const error = failures.deny?.shift();
        if (error) return { data: null, error };
        return { data: { redirect_url: deniedRedirect }, error: null };
      },
    },
  };
  return { auth, calls };
}
