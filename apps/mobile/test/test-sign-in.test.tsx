import { localSupabaseUrl, testUser } from '@mtgscan/supabase/test-user';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { fakeSupabase, testUserHasPassword, testUserIsNotSeeded } from './fake-supabase';
import {
  appleSignInButton,
  openSettings,
  queryAppleSignInButton,
  selectedTab,
  showsSpinner,
  tabHeader,
} from './native-ui';
import { renderApp } from './render-app';

type Build = {
  development?: boolean;
  testSignIn?: string;
  supabaseUrl?: string;
};

const hostedSupabaseUrl = 'https://abcdefghijklmnop.supabase.co';
const hostedTestUserPassword = 'hosted-test-user-password';

const buildSettings = [
  'EXPO_PUBLIC_TEST_SIGN_IN',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_APP_VARIANT',
  'EXPO_PUBLIC_TEST_USER_PASSWORD',
] as const;
const environment = Object.fromEntries(buildSettings.map((name) => [name, process.env[name]]));

function runAs({ development = true, testSignIn = 'true', supabaseUrl = localSupabaseUrl }: Build = {}) {
  jest.replaceProperty(globalThis as typeof globalThis & { __DEV__: boolean }, '__DEV__', development);
  process.env.EXPO_PUBLIC_TEST_SIGN_IN = testSignIn;
  process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
}

function runAsTestApp(password = hostedTestUserPassword) {
  runAs({ development: false, testSignIn: '', supabaseUrl: hostedSupabaseUrl });
  process.env.EXPO_PUBLIC_APP_VARIANT = 'test';
  process.env.EXPO_PUBLIC_TEST_USER_PASSWORD = password;
  testUserHasPassword(hostedTestUserPassword);
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

  expect(tabHeader(selectedTab()).title).toBe('Recent');
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
  expect(tabHeader(selectedTab()).title).toBe('Recent');
});

test('while the test sign-in runs, the other sign-in buttons fade and the test sign-in button keeps its full color', async () => {
  jest.spyOn(fakeSupabase.auth, 'signInWithPassword').mockReturnValueOnce(new Promise(() => {}));
  runAs();
  await renderApp();

  await signInAsTheTestUser();

  expect(screen.getByRole('button', { name: 'Sign in as the test user' })).not.toHaveStyle({ opacity: expect.closeTo(0.38) });
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveStyle({ opacity: expect.closeTo(0.38) });
  expect(appleSignInButton().parent).toHaveStyle({ opacity: expect.closeTo(0.38) });
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

test('the test app signs the hosted test user in with one tap and lands on Recent', async () => {
  runAsTestApp();
  await renderApp();

  await signInAsTheTestUser();

  expect(tabHeader(selectedTab()).title).toBe('Recent');
  await openSettings();
  expect(screen.getByText('test-user@mtgscan.test')).toBeOnTheScreen();
});

test('the test app has no Apple or Google sign-in', async () => {
  runAsTestApp();
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Sign in as the test user' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeOnTheScreen();
  expect(queryAppleSignInButton()).toBeNull();
});

test('the test app signs in with its own password, not the local default', async () => {
  runAsTestApp(testUser.password);
  await renderApp();

  await signInAsTheTestUser();

  expect(screen.getByRole('alert', { name: 'Sign-in did not work.' })).toBeOnTheScreen();
});

test('a build without the test app variant keeps Apple and Google sign-in and has no test sign-in', async () => {
  runAs({ development: false, testSignIn: '', supabaseUrl: hostedSupabaseUrl });
  process.env.EXPO_PUBLIC_APP_VARIANT = '';
  await renderApp();

  expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
  expect(appleSignInButton()).toBeTruthy();
  expect(queryTestSignIn()).not.toBeOnTheScreen();
});
