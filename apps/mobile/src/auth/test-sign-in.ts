import type { TestSignInButton } from '@/auth/test-sign-in-button';

type TestUserAccount = typeof import('@mtgscan/supabase/test-user');
type TestSignInButtonModule = typeof import('@/auth/test-sign-in-button');

type TestSignIn = {
  TestSignInButton: typeof TestSignInButton;
  password: string;
  hidesAppleAndGoogle: boolean;
};

export function testSignIn(): TestSignIn | null {
  if (process.env.EXPO_PUBLIC_APP_VARIANT === 'test') {
    return {
      TestSignInButton: (require('@/auth/test-sign-in-button') as TestSignInButtonModule).TestSignInButton,
      password: process.env.EXPO_PUBLIC_TEST_USER_PASSWORD ?? '',
      hidesAppleAndGoogle: true,
    };
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_TEST_SIGN_IN === 'true') {
    const { isLocalStack, testUser } = require('@mtgscan/supabase/test-user') as TestUserAccount;
    if (isLocalStack(process.env.EXPO_PUBLIC_SUPABASE_URL)) {
      return {
        TestSignInButton: (require('@/auth/test-sign-in-button') as TestSignInButtonModule).TestSignInButton,
        password: testUser.password,
        hidesAppleAndGoogle: false,
      };
    }
  }
  return null;
}
