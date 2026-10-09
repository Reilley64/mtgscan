import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import {
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import {
  appleSignInFails,
  appleSignInIsCancelled,
  appleSignInSucceeds,
  appleSignInWaits,
  spyOnAppleRequest,
} from './fake-apple';
import { failNextSignIn, signInNextWithEmail, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  appleSignInButton,
  openSettings,
  pressSignInWithApple,
  queryAppleSignInButton,
  selectedTab,
  showsSpinner,
} from './native-ui';
import { renderApp } from './render-app';

function continueWithGoogle() {
  return fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
}

function failNetwork() {
  failNextSignIn(new AuthRetryableFetchError('Network request failed', 0));
}

test('with no session, the sign-in screen offers Continue with Google', async () => {
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Recent' })).not.toBeOnTheScreen();
});

test('Sign in with Apple shows in white, 50 px tall, above Continue with Google', async () => {
  await renderApp();

  const google = await screen.findByRole('button', { name: 'Continue with Google' });
  const apple = appleSignInButton();
  expect(apple.props).toMatchObject({
    buttonType: AppleAuthenticationButtonType.SIGN_IN,
    buttonStyle: AppleAuthenticationButtonStyle.WHITE,
  });
  expect(apple).toHaveStyle({ height: 50 });
  expect(appearsBefore(apple, google)).toBe(true);
});

test('the sign-in sheet says what mtgscan does and that the collection stays private', async () => {
  await renderApp();

  expect(
    await screen.findByRole('header', { name: 'Every card you own, in one binder.' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Scan your cards, see what each one is worth, and build Commander decks from them.',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText(/Your collection and decks stay private\./)).toBeOnTheScreen();
  expect(screen.getByText('Card images from Scryfall')).toBeOnTheScreen();
});

test('Privacy policy opens the privacy policy in the system browser', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
  await renderApp();

  await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));

  expect(openURL).toHaveBeenCalledWith('https://mtgscan.reilley.dev/privacy');
});

test('while Google sign-in runs, its button shows a spinner and no sign-in button can be tapped', async () => {
  let finishGoogleSignIn = () => {};
  const signIn = jest.spyOn(GoogleSignin, 'signIn').mockReturnValueOnce(
    new Promise((resolve) => {
      finishGoogleSignIn = () => resolve({ type: 'cancelled', data: null });
    }),
  );
  await renderApp();

  await continueWithGoogle();

  const button = screen.getByRole('button', { name: 'Continue with Google' });
  expect(button).toBeBusy();
  expect(button).toBeDisabled();
  expect(showsSpinner(button)).toBe(true);
  await fireEvent.press(button);
  expect(signIn).toHaveBeenCalledTimes(1);
  const appleRequest = spyOnAppleRequest();
  await pressSignInWithApple();
  expect(appleRequest).not.toHaveBeenCalled();

  await act(async () => finishGoogleSignIn());
  const readyButton = screen.getByRole('button', { name: 'Continue with Google' });
  expect(readyButton).not.toBeBusy();
  expect(showsSpinner(readyButton)).toBe(false);
});

test('while Apple sign-in runs, its button shows a spinner and no sign-in button can be tapped', async () => {
  const appleSignIn = appleSignInWaits();
  await renderApp();

  await pressSignInWithApple();

  const button = screen.getByRole('button', { name: 'Sign in with Apple' });
  expect(button).toBeBusy();
  expect(button).toBeDisabled();
  expect(showsSpinner(button)).toBe(true);
  expect(queryAppleSignInButton()).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();

  await act(async () => appleSignIn.cancel());
  expect(appleSignInButton()).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Sign in with Apple' })).not.toBeOnTheScreen();
});

test('a successful Apple sign-in lands on Recent', async () => {
  appleSignInSucceeds();
  await renderApp();

  await pressSignInWithApple();

  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('after an Apple sign-in with Hide My Email, settings shows Apple and the relay email', async () => {
  appleSignInSucceeds();
  signInNextWithEmail('k7x2p9q4mz@privaterelay.appleid.com');
  await renderApp();
  await pressSignInWithApple();

  await openSettings();

  expect(screen.getByText('Signed in with Apple')).toBeOnTheScreen();
  expect(screen.getByText('k7x2p9q4mz@privaterelay.appleid.com')).toBeOnTheScreen();
});

test('cancelling the Apple prompt stays on the sign-in screen with no error', async () => {
  appleSignInIsCancelled();
  await renderApp();

  await pressSignInWithApple();

  expect(appleSignInButton()).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
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
  ['the network after Google', failNetwork, continueWithGoogle],
  [
    'Google',
    () => jest.spyOn(GoogleSignin, 'signIn').mockRejectedValueOnce(new Error('Google failed')),
    continueWithGoogle,
  ],
  [
    'the network after Apple',
    () => {
      appleSignInSucceeds();
      failNetwork();
    },
    pressSignInWithApple,
  ],
  ['Apple', appleSignInFails, pressSignInWithApple],
])(
  'a sign-in failure from %s replaces the sign-in buttons with a short message and Try again',
  async (_, fail, signIn) => {
    fail();
    await renderApp();

    await signIn();

    expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeOnTheScreen();
    expect(queryAppleSignInButton()).toBeNull();
  },
);

test('Try again brings back the sign-in buttons, and the next sign-in lands on Recent', async () => {
  jest.spyOn(GoogleSignin, 'signIn').mockRejectedValueOnce(new Error('Google failed'));
  await renderApp();
  await continueWithGoogle();

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(screen.queryByText('Sign-in did not work.')).not.toBeOnTheScreen();
  expect(appleSignInButton()).toBeOnTheScreen();
  await continueWithGoogle();
  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('the settings sheet shows the provider and email of the signed-in account', async () => {
  startSignedIn({ provider: 'google', email: 'player@example.com' });
  await renderApp();

  await openSettings();

  expect(screen.getByText('Signed in with Google')).toBeOnTheScreen();
  expect(screen.getByText('player@example.com')).toBeOnTheScreen();
});

test('after Google and then Apple sign in with the same email, settings shows Apple', async () => {
  await renderApp();
  await continueWithGoogle();
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  appleSignInSucceeds();
  await pressSignInWithApple();

  await openSettings();

  expect(screen.getByText('Signed in with Apple')).toBeOnTheScreen();
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
