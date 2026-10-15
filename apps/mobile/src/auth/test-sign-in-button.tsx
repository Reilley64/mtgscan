import { testUser } from '@mtgscan/supabase/test-user';

import type { SignInOutcome } from '@/auth/sign-in';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { supabase } from '@/lib/supabase';

async function signInAsTestUser(password: string): Promise<SignInOutcome> {
  const { error } = await supabase.auth.signInWithPassword({ email: testUser.email, password });
  if (error) {
    throw error;
  }
  return 'signed-in';
}

type TestSignInButtonProps = {
  password: string;
  busy: boolean;
  disabled: boolean;
  onSignIn: (signIn: () => Promise<SignInOutcome>) => void;
};

export function TestSignInButton({ password, busy, disabled, onSignIn }: TestSignInButtonProps) {
  return (
    <Button size="sign-in" busy={busy} disabled={disabled} onPress={() => onSignIn(() => signInAsTestUser(password))}>
      <Text>Sign in as the test user</Text>
    </Button>
  );
}
