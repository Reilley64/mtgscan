import { useState } from 'react';
import { Image, Linking, View } from 'react-native';

import { signInWithApple } from '@/auth/apple-sign-in';
import { signInWithGoogle } from '@/auth/google-sign-in';
import type { SignInOutcome, SignInProvider } from '@/auth/sign-in';
import { testSignInButton } from '@/auth/test-sign-in';
import { AppleSignInButton } from '@/components/atoms/apple-sign-in-button';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { Brand } from '@/components/molecules/brand';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { BinderWall } from '@/components/organisms/binder-wall';
import { SignInSheet } from '@/components/organisms/sign-in-sheet';

const privacyPolicyUrl = 'https://mtgscan.reilley.dev/privacy';

type SignInMethod = SignInProvider | 'test-user';

type SignInStatus =
  { name: 'ready' } | { name: 'signing-in'; method: SignInMethod } | { name: 'failed' };

export default function SignInScreen() {
  const [status, setStatus] = useState<SignInStatus>({ name: 'ready' });
  const [TestSignInButton] = useState(testSignInButton);
  const signingIn = status.name === 'signing-in';
  const busyWith = (method: SignInMethod) => signingIn && status.method === method;

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
    <View className="flex-1 overflow-hidden bg-background">
      <BinderWall />
      <View className="px-lg pt-safe-offset-sm">
        <View className="mx-xs">
          <Brand />
        </View>
      </View>
      <SignInSheet onOpenPrivacyPolicy={() => void Linking.openURL(privacyPolicyUrl)}>
        {status.name === 'failed' ? (
          <>
            <FailureNotice message="Sign-in did not work." />
            <Button variant="primary" size="sign-in" onPress={() => setStatus({ name: 'ready' })}>
              <Text>Try again</Text>
            </Button>
          </>
        ) : (
          <>
            <AppleSignInButton
              busy={busyWith('apple')}
              disabled={signingIn}
              onPress={() => void signIn('apple', signInWithApple)}
            />
            <Button
              variant="google"
              size="sign-in"
              busy={busyWith('google')}
              disabled={signingIn && !busyWith('google')}
              onPress={() => void signIn('google', signInWithGoogle)}>
              {busyWith('google') ? null : (
                <Image source={require('../../assets/google-logo.png')} className="h-google-logo w-google-logo" />
              )}
              <Text>Continue with Google</Text>
            </Button>
            {TestSignInButton && (
              <TestSignInButton
                busy={busyWith('test-user')}
                disabled={signingIn && !busyWith('test-user')}
                onSignIn={(run) => void signIn('test-user', run)}
              />
            )}
          </>
        )}
      </SignInSheet>
    </View>
  );
}
