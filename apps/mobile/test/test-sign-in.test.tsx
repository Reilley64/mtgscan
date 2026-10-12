import { localSupabaseUrl } from '@mtgscan/supabase/test-user';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { fakeSupabase, testUserIsNotSeeded } from './fake-supabase';
import { openSettings, queryAppleSignInButton, selectedTab, showsSpinner } from './native-ui';
import { renderApp } from './render-app';

type Build = {
  development?: boolean;
  testSignIn?: string;
  supabaseUrl?: string;
};

const buildSettings = ['EXPO_PUBLIC_TEST_SIGN_IN', 'EXPO_PUBLIC_SUPABASE_URL'] as const;
const environment = Object.fromEntries(buildSettings.map((name) => [name, process.env[name]]));

function runAs({ development = true, testSignIn = 'true', supabaseUrl = localSupabaseUrl }: Build = {}) {
  jest.replaceProperty(globalThis as typeof globalThis & { __DEV__: boolean }, '__DEV__', development);
  process.env.EXPO_PUBLIC_TEST_SIGN_IN = testSignIn;
  process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
}

function queryTestSignIn() {
  return screen.queryByRole('button', { name: 'Sign in as the test user' });
}

async function signInAsTheTestUser() {
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in as the test user' }));
  await act(async () => {});
}

afterEach(() => {
  jest.restoreAllMocks();
  for (const name of buildSettings) {
    if (environment[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = environment[name];
    }
  }
});

test('a development build on local Supabase signs the test user in with one tap and lands on Recent', async () => {
  runAs();
  await renderApp();

  await signInAsTheTestUser();

  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
  await openSettings();
  expect(screen.getByText('test-user@mtgscan.test')).toBeOnTheScreen();
});

test('the test sign-in also accepts the local stack at localhost', async () => {
  runAs({ supabaseUrl: 'http://localhost:54321' });
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Sign in as the test user' })).toBeOnTheScreen();
});

test('a production build has no test sign-in, even with test sign-in on and local Supabase', async () => {
  runAs({ development: false });
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(queryTestSignIn()).not.toBeOnTheScreen();
});

test.each(['', 'false', '1'])(
  'a development build has no test sign-in when EXPO_PUBLIC_TEST_SIGN_IN is %p',
  async (testSignIn) => {
    runAs({ testSignIn });
    await renderApp();

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
    expect(queryTestSignIn()).not.toBeOnTheScreen();
  },
);

test.each([
  'https://abcdefghijklmnop.supabase.co',
  'http://127.0.0.1.example.com:54321',
  'http://localhost.example.com',
  'https://127.0.0.1:54321',
  'http://192.168.1.20:54321',
  '',
])('the test sign-in refuses Supabase at %p, which is not the local stack', async (supabaseUrl) => {
  runAs({ supabaseUrl });
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(queryTestSignIn()).not.toBeOnTheScreen();
});

test('while the test sign-in runs, its button shows a spinner and no sign-in button can be tapped', async () => {
  let finishSignIn = () => {};
  const signIn = fakeSupabase.auth.signInWithPassword;
  jest.spyOn(fakeSupabase.auth, 'signInWithPassword').mockImplementationOnce(
    (credentials) => new Promise((resolve) => (finishSignIn = () => resolve(signIn(credentials)))),
  );
  runAs();
  await renderApp();

  await signInAsTheTestUser();

  const button = screen.getByRole('button', { name: 'Sign in as the test user' });
  expect(button).toBeBusy();
  expect(button).toBeDisabled();
  expect(showsSpinner(button)).toBe(true);
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await act(async () => finishSignIn());
  expect(within(selectedTab()).getByRole('header', { name: 'Recent' })).toBeOnTheScreen();
});

test('when the test user is not seeded, the test sign-in says Sign-in did not work and offers Try again', async () => {
  runAs();
  testUserIsNotSeeded();
  await renderApp();

  await signInAsTheTestUser();

  expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
  expect(queryTestSignIn()).not.toBeOnTheScreen();
  expect(queryAppleSignInButton()).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(queryTestSignIn()).toBeOnTheScreen();
});
