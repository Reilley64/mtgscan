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

const signInProvidersByIssuer = new Map<string, SignInProvider>([
  ['https://appleid.apple.com', 'apple'],
  ['https://accounts.google.com', 'google'],
  ['accounts.google.com', 'google'],
]);

function currentSignInProvider(user: User): string {
  const issuer = user.user_metadata.iss;
  return signInProvidersByIssuer.get(issuer) ?? user.app_metadata.provider ?? '';
}

export function currentSignInProviderName(user: User) {
  const provider = currentSignInProvider(user);
  return isSignInProvider(provider) ? signInProviderNames[provider] : provider;
}
