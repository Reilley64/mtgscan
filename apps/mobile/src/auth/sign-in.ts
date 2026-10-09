import type { User } from '@supabase/supabase-js';

export type SignInProvider = 'apple' | 'google';

export type SignInOutcome = 'signed-in' | 'cancelled';

const signInProviderNames: Record<SignInProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

function isSignInProvider(provider: string): provider is SignInProvider {
  return Object.hasOwn(signInProviderNames, provider);
}

function lastSignInTime(signedInAt: string | undefined) {
  return signedInAt ? Date.parse(signedInAt) : 0;
}

function currentSignInProvider(user: User) {
  const [latest] = [...(user.identities ?? [])].sort(
    (first, second) =>
      lastSignInTime(second.last_sign_in_at) - lastSignInTime(first.last_sign_in_at),
  );
  return latest?.provider ?? user.app_metadata.provider ?? '';
}

export function currentSignInProviderName(user: User) {
  const provider = currentSignInProvider(user);
  return isSignInProvider(provider) ? signInProviderNames[provider] : provider;
}
