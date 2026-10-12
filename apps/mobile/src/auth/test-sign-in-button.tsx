import { testUser } from '@mtgscan/supabase/test-user';

import type { SignInOutcome } from '@/auth/sign-in';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { supabase } from '@/lib/supabase';

async function signInAsTestUser(): Promise<SignInOutcome> {
  const { error } = await supabase.auth.signInWithPassword(testUser);
  if (error) {
    throw error;
  }
  return 'signed-in';
}

type TestSignInButtonProps = {
  busy: boolean;
  disabled: boolean;
  onSignIn: (signIn: () => Promise<SignInOutcome>) => void;
};

export function TestSignInButton({ busy, disabled, onSignIn }: TestSignInButtonProps) {
  return (
    <Button size="sign-in" busy={busy} disabled={disabled} onPress={() => onSignIn(signInAsTestUser)}>
      <Text>Sign in as the test user</Text>
    </Button>
  );
}
