import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { supabase } from '@/lib/supabase';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export type SignInOutcome = 'signed-in' | 'cancelled';

export async function signInWithGoogle(): Promise<SignInOutcome> {
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    return 'cancelled';
  }
  const { idToken } = response.data;
  if (!idToken) {
    throw new Error('Google returned no ID token');
  }
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) {
    throw error;
  }
  return 'signed-in';
}

export async function signOut() {
  await supabase.auth.signOut({ scope: 'local' });
  await GoogleSignin.signOut();
}
