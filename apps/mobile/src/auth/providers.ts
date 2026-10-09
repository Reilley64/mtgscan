export type SignInProvider = 'apple' | 'google';

export type SignInOutcome = 'signed-in' | 'cancelled';

const signInProviderNames: Record<SignInProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

function isSignInProvider(provider: string): provider is SignInProvider {
  return Object.hasOwn(signInProviderNames, provider);
}

export function signInProviderName(provider: string) {
  return isSignInProvider(provider) ? signInProviderNames[provider] : provider;
}
