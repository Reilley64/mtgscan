import {
  AppleAuthenticationScope,
  signInAsync,
  type AppleAuthenticationCredential,
} from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import type { SignInOutcome } from '@/auth/providers';
import { supabase } from '@/lib/supabase';

const appleCancelledCode = 'ERR_REQUEST_CANCELED';

function isAppleCancellation(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === appleCancelledCode;
}

async function requestAppleCredential(
  nonce: string,
): Promise<AppleAuthenticationCredential | null> {
  try {
    return await signInAsync({
      requestedScopes: [AppleAuthenticationScope.EMAIL],
      nonce: await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce),
    });
  } catch (error) {
    if (isAppleCancellation(error)) {
      return null;
    }
    throw error;
  }
}

export async function signInWithApple(): Promise<SignInOutcome> {
  const nonce = randomUUID();
  const credential = await requestAppleCredential(nonce);
  if (!credential) {
    return 'cancelled';
  }
  const { identityToken } = credential;
  if (!identityToken) {
    throw new Error('Apple returned no ID token');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce,
  });
  if (error) {
    throw error;
  }
  return 'signed-in';
}
