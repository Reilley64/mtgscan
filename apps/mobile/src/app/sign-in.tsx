import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithGoogle } from '@/auth/google-sign-in';
import { colors, googleButtonColors, rounded, sizes, spacing, typography } from '@/theme';

type SignInStatus = 'ready' | 'signing-in' | 'failed';

export default function SignInScreen() {
  const [status, setStatus] = useState<SignInStatus>('ready');

  async function continueWithGoogle() {
    setStatus('signing-in');
    try {
      const outcome = await signInWithGoogle();
      if (outcome === 'cancelled') {
        setStatus('ready');
      }
    } catch {
      setStatus('failed');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>
          mtgscan
        </Text>
        <Text style={styles.message}>
          Scan your cards, keep your collection, and build Commander decks.
        </Text>
      </View>
      <View style={styles.actions}>
        {status === 'failed' && (
          <View style={styles.failure}>
            <Text style={styles.message}>Sign-in did not work. Check your connection.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={continueWithGoogle}
              style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonLabel}>Try again</Text>
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: status === 'signing-in' }}
          disabled={status === 'signing-in'}
          onPress={continueWithGoogle}
          style={[styles.button, styles.googleButton]}>
          <Image source={require('../../assets/google-logo.png')} style={styles.googleLogo} />
          <Text style={styles.googleButtonLabel}>Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
  intro: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.largeTitle,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.lg,
  },
  failure: {
    gap: spacing.sm,
  },
  button: {
    height: sizes.button,
    borderRadius: rounded.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceControl,
  },
  secondaryButtonLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  googleButton: {
    backgroundColor: googleButtonColors.background,
    borderColor: googleButtonColors.border,
    borderWidth: 1,
  },
  googleLogo: {
    width: 20,
    height: 20,
  },
  googleButtonLabel: {
    ...typography.bodyStrong,
    color: googleButtonColors.text,
  },
});
