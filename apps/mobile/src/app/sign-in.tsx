import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signInWithApple } from '@/auth/apple-sign-in';
import { signInWithGoogle } from '@/auth/google-sign-in';
import type { SignInOutcome, SignInProvider } from '@/auth/sign-in';
import { testSignInButton } from '@/auth/test-sign-in';
import { BinderWall } from '@/components/organisms/binder-wall';
import {
  appleButtonColors,
  colors,
  googleButtonColors,
  rounded,
  sizes,
  spacing,
  typography,
} from '@/theme';

const privacyPolicyUrl = 'https://mtgscan.reilley.dev/privacy';

type SignInMethod = SignInProvider | 'test-user';

type SignInStatus =
  { name: 'ready' } | { name: 'signing-in'; method: SignInMethod } | { name: 'failed' };

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SignInStatus>({ name: 'ready' });
  const [TestSignInButton] = useState(testSignInButton);
  const signingIn = status.name === 'signing-in';
  const signingInWithApple = signingIn && status.method === 'apple';
  const signingInWithGoogle = signingIn && status.method === 'google';
  const signingInAsTestUser = signingIn && status.method === 'test-user';

  async function signIn(method: SignInMethod, run: () => Promise<SignInOutcome>) {
    setStatus({ name: 'signing-in', method });
    try {
      const outcome = await run();
      if (outcome === 'cancelled') {
        setStatus({ name: 'ready' });
      }
    } catch {
      setStatus({ name: 'failed' });
    }
  }

  return (
    <View style={styles.screen}>
      <BinderWall />
      <View pointerEvents="none" style={styles.scrim} />
      <View style={[styles.brand, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.brandMark} />
        <Text style={styles.brandName}>mtgscan</Text>
      </View>
      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs }]}>
        <View style={styles.grabber} />
        <Text accessibilityRole="header" style={styles.title}>
          Every card you own, in one binder.
        </Text>
        <Text style={styles.message}>
          Scan your cards, see what each one is worth, and build Commander decks from them.
        </Text>
        {status.name === 'failed' ? (
          <View style={styles.actions}>
            <View
              accessible
              accessibilityLabel="Sign-in did not work."
              accessibilityRole="alert"
              style={styles.failure}>
              <View style={styles.failureMark}>
                <Text style={styles.failureMarkLabel}>!</Text>
              </View>
              <Text style={styles.failureMessage}>Sign-in did not work.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStatus({ name: 'ready' })}
              style={[styles.signInButton, styles.tryAgain]}>
              <Text style={styles.tryAgainLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            {signingInWithApple ? (
              <View
                accessible
                accessibilityLabel="Sign in with Apple"
                accessibilityRole="button"
                accessibilityState={{ busy: true, disabled: true }}
                style={[styles.signInButton, styles.appleButtonBusy]}>
                <ActivityIndicator color={appleButtonColors.text} />
              </View>
            ) : (
              <View style={signingIn && styles.dimmed}>
                <AppleAuthenticationButton
                  buttonType={AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={rounded.sm}
                  onPress={() => {
                    if (!signingIn) {
                      void signIn('apple', signInWithApple);
                    }
                  }}
                  style={styles.appleButton}
                />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: signingInWithGoogle }}
              disabled={signingIn}
              onPress={() => void signIn('google', signInWithGoogle)}
              style={[
                styles.signInButton,
                styles.googleButton,
                signingIn && !signingInWithGoogle && styles.dimmed,
              ]}>
              {signingInWithGoogle ? (
                <ActivityIndicator color={googleButtonColors.text} style={styles.signInLogo} />
              ) : (
                <Image source={require('../../assets/google-logo.png')} style={styles.signInLogo} />
              )}
              <Text style={styles.googleButtonLabel}>Continue with Google</Text>
            </Pressable>
            {TestSignInButton && (
              <TestSignInButton
                busy={signingInAsTestUser}
                disabled={signingIn}
                style={[styles.signInButton, signingIn && !signingInAsTestUser && styles.dimmed]}
                onSignIn={(run) => void signIn('test-user', run)}
              />
            )}
          </View>
        )}
        <Text style={styles.privacy}>
          Your collection and decks stay private.{' '}
          <Text
            accessibilityRole="link"
            onPress={() => void Linking.openURL(privacyPolicyUrl)}
            style={styles.privacyLink}>
            Privacy policy
          </Text>
        </Text>
        <Text style={styles.credit}>Card images from Scryfall</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(8, 11, 13, 0.9) 0%, rgba(8, 11, 13, 0.2) 16%, rgba(8, 11, 13, 0.25) 45%, rgba(8, 11, 13, 0.9) 62%)',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: spacing.lg + spacing.xs,
  },
  brandMark: {
    width: 18,
    height: 25,
    borderWidth: 2.5,
    borderRadius: rounded.xs,
    borderColor: colors.primary,
  },
  brandName: {
    ...typography.brand,
    color: colors.text,
  },
  sheet: {
    marginTop: 'auto',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: rounded.md,
    borderTopRightRadius: rounded.md,
    backgroundColor: colors.sheet,
    boxShadow: '0px -12px 40px rgba(0, 0, 0, 0.55)',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    marginBottom: spacing.md,
    borderRadius: rounded.full,
    backgroundColor: colors.grabber,
  },
  title: {
    ...typography.signInTitle,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.xs,
    color: colors.text,
  },
  message: {
    ...typography.body,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.lg,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.sm,
  },
  signInButton: {
    height: sizes.signInButton,
    borderRadius: rounded.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dimmed: {
    opacity: 0.38,
  },
  signInLogo: {
    width: sizes.googleLogo,
    height: sizes.googleLogo,
  },
  appleButton: {
    height: sizes.signInButton,
  },
  appleButtonBusy: {
    backgroundColor: appleButtonColors.background,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: googleButtonColors.border,
    backgroundColor: googleButtonColors.background,
  },
  googleButtonLabel: {
    ...typography.googleButton,
    color: googleButtonColors.text,
  },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
  },
  failureMark: {
    width: 22,
    height: 22,
    borderRadius: rounded.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerTint,
  },
  failureMarkLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.danger,
  },
  failureMessage: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  tryAgain: {
    backgroundColor: colors.primary,
  },
  tryAgainLabel: {
    ...typography.signInButton,
    color: colors.onPrimary,
  },
  privacy: {
    ...typography.meta,
    marginTop: spacing.md,
    textAlign: 'center',
    color: colors.textDim,
  },
  privacyLink: {
    fontWeight: '700',
    color: colors.primary,
  },
  credit: {
    ...typography.credit,
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.textDim,
  },
});
