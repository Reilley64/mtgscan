import { testUser } from '@mtgscan/supabase/test-user';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { SignInOutcome } from '@/auth/sign-in';
import { supabase } from '@/lib/supabase';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

async function signInAsTestUser(): Promise<SignInOutcome> {
  const { error } = await supabase.auth.signInWithPassword(testUser);
  if (error) {
    throw error;
  }
  return 'signed-in';
}

type TestSignInButtonProps = {
  signingIn: boolean;
  busy: boolean;
  onSignIn: (signIn: () => Promise<SignInOutcome>) => void;
};

export function TestSignInButton({ signingIn, busy, onSignIn }: TestSignInButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={signingIn}
      onPress={() => onSignIn(signInAsTestUser)}
      style={[styles.button, signingIn && !busy && styles.dimmed]}>
      {busy && <ActivityIndicator color={colors.text} />}
      <Text style={styles.label}>Sign in as the test user</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: sizes.signInButton,
    borderRadius: rounded.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceControl,
  },
  dimmed: {
    opacity: 0.38,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
