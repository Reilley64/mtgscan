import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithGoogle } from '@/auth/google-sign-in';
import { SecondaryButton } from '@/components/secondary-button';
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
      {status === 'failed' ? (
        <View style={styles.actions}>
          <Text style={styles.message}>Sign-in did not work.</Text>
          <SecondaryButton label="Try again" onPress={continueWithGoogle} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: status === 'signing-in' }}
          disabled={status === 'signing-in'}
          onPress={continueWithGoogle}
          style={styles.googleButton}>
          <Image source={require('../../assets/google-logo.png')} style={styles.googleLogo} />
          <Text style={styles.googleButtonLabel}>Continue with Google</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
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
    gap: spacing.sm,
  },
  googleButton: {
    height: sizes.button,
    borderRadius: rounded.sm,
    borderWidth: 1,
    borderColor: googleButtonColors.border,
    backgroundColor: googleButtonColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  googleLogo: {
    width: sizes.googleLogo,
    height: sizes.googleLogo,
  },
  googleButtonLabel: {
    ...typography.bodyStrong,
    color: googleButtonColors.text,
  },
});
