import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { failNextSignIn, startSignedIn } from './fake-supabase';
import { openSettings, selectedTab } from './native-ui';
import { renderApp } from './render-app';

function continueWithGoogle() {
  return fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
}

test('with no session, the sign-in screen offers Continue with Google', async () => {
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Recent' })).not.toBeOnTheScreen();
});

test('a successful Google sign-in lands on Recent', async () => {
  await renderApp();

  await continueWithGoogle();

  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('cancelling the Google prompt stays on the sign-in screen with no error', async () => {
  jest.spyOn(GoogleSignin, 'signIn').mockResolvedValueOnce({ type: 'cancelled', data: null });
  await renderApp();

  await continueWithGoogle();

  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
});

test.each([
  ['the network', () => failNextSignIn(new AuthRetryableFetchError('Network request failed', 0))],
  ['Google', () => jest.spyOn(GoogleSignin, 'signIn').mockRejectedValueOnce(new Error('Google failed'))],
])('a sign-in failure from %s shows a short message, and Try again signs in', async (_, fail) => {
  fail();
  await renderApp();

  await continueWithGoogle();

  expect(screen.getByText('Sign-in did not work.')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('the settings sheet shows the provider and email of the signed-in account', async () => {
  startSignedIn({ provider: 'google', email: 'player@example.com' });
  await renderApp();

  await openSettings();

  expect(screen.getByText('Signed in with Google')).toBeOnTheScreen();
  expect(screen.getByText('player@example.com')).toBeOnTheScreen();
});

test('Sign out returns to the sign-in screen with no user data on screen', async () => {
  startSignedIn({ provider: 'google', email: 'player@example.com' });
  await renderApp();
  await openSettings();

  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(screen.queryByText('player@example.com')).not.toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Recent' })).not.toBeOnTheScreen();
});
