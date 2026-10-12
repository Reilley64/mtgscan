import type { TestSignInButton } from '@/auth/test-sign-in-button';

type TestUserAccount = typeof import('@mtgscan/supabase/test-user');
type TestSignInButtonModule = typeof import('@/auth/test-sign-in-button');

export function testSignInButton(): typeof TestSignInButton | null {
  if (__DEV__ && process.env.EXPO_PUBLIC_TEST_SIGN_IN === 'true') {
    const { isLocalStack } = require('@mtgscan/supabase/test-user') as TestUserAccount;
    if (isLocalStack(process.env.EXPO_PUBLIC_SUPABASE_URL)) {
      return (require('@/auth/test-sign-in-button') as TestSignInButtonModule).TestSignInButton;
    }
  }
  return null;
}
