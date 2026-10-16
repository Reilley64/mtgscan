import { AuthApiError, type OAuthAuthorizationDetails, type Session } from '@supabase/supabase-js';

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

export function googleSession(email = 'player@example.com'): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'user-1',
      aud: 'authenticated',
      email,
      app_metadata: { provider: 'apple' },
      user_metadata: { iss: 'https://accounts.google.com' },
      created_at: '2026-10-16T00:00:00Z',
    },
  };
}

type FakeAuthOptions = {
  session?: Session;
  details?: OAuthAuthorizationDetails | { redirect_url: string } | 'expired';
};

export function fakeAuth({ session, details = chatGptDetails }: FakeAuthOptions = {}) {
  const calls = {
    signIns: [] as Parameters<ConsentAuth['signInWithOAuth']>[0][],
    signOuts: [] as Parameters<ConsentAuth['signOut']>[0][],
    approvals: [] as string[],
    denials: [] as string[],
  };
  let currentSession = session ?? null;
  const expired = new AuthApiError('Authorization not found', 404, 'oauth_authorization_not_found');

  const auth: ConsentAuth = {
    async getSession() {
      return currentSession
        ? { data: { session: currentSession }, error: null }
        : { data: { session: null }, error: null };
    },
    async signInWithOAuth(credentials) {
      calls.signIns.push(credentials);
      return {
        data: { provider: credentials.provider, url: 'https://supabase.test/auth/v1/authorize?provider=google' },
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
        if (details === 'expired' || id !== authorizationId) return { data: null, error: expired };
        return { data: details, error: null };
      },
      async approveAuthorization(id) {
        calls.approvals.push(id);
        return {
          data: { redirect_url: 'https://chatgpt.com/connector_platform_oauth_redirect?code=code-1&state=state-1' },
          error: null,
        };
      },
      async denyAuthorization(id) {
        calls.denials.push(id);
        return {
          data: {
            redirect_url: 'https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=state-1',
          },
          error: null,
        };
      },
    },
  };
  return { auth, calls };
}
