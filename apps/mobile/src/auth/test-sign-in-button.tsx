import { testUser } from '@mtgscan/supabase/test-user';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { SignInOutcome } from '@/auth/sign-in';
import { supabase } from '@/lib/supabase';
import { colors, typography } from '@/theme';

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
  style: StyleProp<ViewStyle>;
  onSignIn: (signIn: () => Promise<SignInOutcome>) => void;
};

export function TestSignInButton({ busy, disabled, style, onSignIn }: TestSignInButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={disabled}
      onPress={() => onSignIn(signInAsTestUser)}
      style={[style, styles.button]}>
      {busy && <ActivityIndicator color={colors.text} />}
      <Text style={styles.label}>Sign in as the test user</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.surfaceControl,
  },
  label: {
    ...typography.signInButton,
    color: colors.text,
  },
});
