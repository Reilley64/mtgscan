import { screen, waitFor } from '@testing-library/dom';
import { describe, expect, test } from 'bun:test';

import { type ConsentAuth, showConsentPage } from '../oauth/consent/consent-page';
import {
  appleSession,
  approvedRedirect,
  authorizationId,
  authorizationNotFound,
  authorizationNotPending,
  chatGptDetails,
  consentPageUrl,
  deniedRedirect,
  fakeAuth,
  googleSession,
  sessionNotFound,
  sessionRejected,
  unreachable,
} from './fake-auth';

const expiredLink = 'This link has expired. Start again from your AI chat.';
const permissions =
  'Read your cards, collection, decks, and deck history. Suggest deck changes. It cannot change your decks or collection.';

async function openConsentPage(auth: ConsentAuth, search = `?authorization_id=${authorizationId}`) {
  const root = document.createElement('main');
  document.body.replaceChildren(root);
  const navigations: string[] = [];
  await showConsentPage({
    auth,
    root,
    url: new URL(consentPageUrl + search),
    navigate: (url) => navigations.push(url),
  });
  return navigations;
}

function buttonNames() {
  return screen.getAllByRole('button').map((button) => button.textContent);
}

describe('consent page', () => {
  test('a link with no authorization_id has expired and shows no buttons', async () => {
    await openConsentPage(fakeAuth({ session: googleSession() }).auth, '');

    expect(screen.getByText(expiredLink)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test.each([
    ['not found or expired', authorizationNotFound],
    ['no longer pending', authorizationNotPending],
  ])('an authorization that is %s shows the expired link and no buttons', async (_, error) => {
    await openConsentPage(fakeAuth({ session: googleSession(), failures: { details: [error] } }).auth);

    expect(screen.getByText(expiredLink)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('signed out, Continue with Apple signs in with a redirect back to the consent page', async () => {
    const { auth, calls } = fakeAuth();
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Continue with Apple' }).click();

    await waitFor(() => expect(navigations).toEqual(['https://supabase.test/auth/v1/authorize?provider=apple']));
    expect(calls.signIns).toEqual([
      {
        provider: 'apple',
        options: {
          redirectTo: `${consentPageUrl}?authorization_id=${authorizationId}`,
          skipBrowserRedirect: true,
        },
      },
    ]);
  });

  test('signed out, Continue with Google signs in with a redirect back to the consent page', async () => {
    const { auth, calls } = fakeAuth();
    const navigations = await openConsentPage(auth);

    expect(screen.getByText('Use the same sign-in as in the app')).toBeDefined();
    expect(buttonNames()).toEqual(['Continue with Apple', 'Continue with Google']);
    screen.getByRole('button', { name: 'Continue with Google' }).click();

    await waitFor(() => expect(navigations).toEqual(['https://supabase.test/auth/v1/authorize?provider=google']));
    expect(calls.signIns).toEqual([
      {
        provider: 'google',
        options: {
          redirectTo: `${consentPageUrl}?authorization_id=${authorizationId}`,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      },
    ]);
  });

  test('a sign-in that cannot start says so under the buttons, and the button tries again', async () => {
    const { auth } = fakeAuth({ failures: { signIn: [unreachable] } });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Continue with Google' }).click();

    expect(await screen.findByText('Could not start the sign-in. Try again.')).toBeDefined();
    expect(buttonNames()).toEqual(['Continue with Apple', 'Continue with Google']);
    expect(navigations).toEqual([]);
    screen.getByRole('button', { name: 'Continue with Google' }).click();
    await waitFor(() => expect(navigations).toEqual(['https://supabase.test/auth/v1/authorize?provider=google']));
  });

  test('signed in, it shows the account, the AI client, what the AI client can do, Allow, and Deny', async () => {
    await openConsentPage(fakeAuth({ session: googleSession() }).auth);

    expect(screen.getByText('Signed in with Google')).toBeDefined();
    expect(screen.getByText('player@example.com')).toBeDefined();
    expect(screen.getByText('Use the same sign-in as in the app')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeDefined();
    expect(screen.getByText('Returns you to chatgpt.com')).toBeDefined();
    expect(screen.getByText(permissions)).toBeDefined();
    expect(buttonNames()).toEqual(['Switch account', 'Allow', 'Deny']);
  });

  test('signed in with Apple, the account card says so', async () => {
    await openConsentPage(fakeAuth({ session: appleSession() }).auth);

    expect(screen.getByText('Signed in with Apple')).toBeDefined();
    expect(screen.getByText('player@example.com')).toBeDefined();
  });

  test('the AI client host comes from its redirect URI, not its name', async () => {
    const details = { ...chatGptDetails, redirect_uri: 'https://chatgpt.example.net:8443/callback' };
    await openConsentPage(fakeAuth({ session: googleSession(), details }).auth);

    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeDefined();
    expect(screen.getByText('Returns you to chatgpt.example.net:8443')).toBeDefined();
  });

  test('Allow approves the authorization and follows the redirect that Supabase returns', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Allow' }).click();

    await waitFor(() => expect(navigations).toEqual([approvedRedirect]));
    expect(calls).toMatchObject({ approvals: [authorizationId], denials: [] });
  });

  test('Deny denies the authorization and sends the AI client access_denied', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Deny' }).click();

    await waitFor(() => expect(navigations).toEqual([deniedRedirect]));
    expect(calls).toMatchObject({ approvals: [], denials: [authorizationId] });
  });

  test('Switch account signs out of this browser only and shows the sign-in buttons', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    await openConsentPage(auth);

    screen.getByRole('button', { name: 'Switch account' }).click();

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeDefined();
    expect(screen.queryByText('Signed in with Google')).toBeNull();
    expect(calls.signOuts).toEqual([{ scope: 'local' }]);
  });

  test('an AI client that the user already allowed goes straight back to its redirect', async () => {
    const details = { redirect_url: 'https://chatgpt.com/connector_platform_oauth_redirect?code=code-2' };
    const navigations = await openConsentPage(fakeAuth({ session: googleSession(), details }).auth);

    expect(navigations).toEqual([details.redirect_url]);
  });

  test.each([
    ['rejected', sessionRejected],
    ['gone', sessionNotFound],
  ])('a session that Supabase finds %s signs out of this browser and shows the sign-in buttons', async (_, error) => {
    const { auth, calls } = fakeAuth({ session: googleSession(), failures: { details: [error] } });
    await openConsentPage(auth);

    expect(buttonNames()).toEqual(['Continue with Apple', 'Continue with Google']);
    expect(calls.signOuts).toEqual([{ scope: 'local' }]);
  });

  test('when mtgscan cannot be reached, Try again loads the authorization again, and Switch account stays', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession(), failures: { details: [unreachable] } });
    await openConsentPage(auth);

    expect(screen.getByText('Could not reach mtgscan.')).toBeDefined();
    expect(screen.getByText('Signed in with Google')).toBeDefined();
    expect(buttonNames()).toEqual(['Switch account', 'Try again']);
    screen.getByRole('button', { name: 'Try again' }).click();

    expect(await screen.findByRole('button', { name: 'Allow' })).toBeDefined();
    expect(calls.details).toEqual([authorizationId, authorizationId]);
  });

  test.each([
    ['Allow', 'approve', approvedRedirect],
    ['Deny', 'deny', deniedRedirect],
  ] as const)('when %s cannot reach mtgscan, Try again sends the same answer again', async (name, call, redirect) => {
    const { auth, calls } = fakeAuth({ session: googleSession(), failures: { [call]: [unreachable] } });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name }).click();

    expect(await screen.findByText('Could not reach mtgscan.')).toBeDefined();
    expect(buttonNames()).toEqual(['Switch account', 'Try again']);
    screen.getByRole('button', { name: 'Try again' }).click();
    await waitFor(() => expect(navigations).toEqual([redirect]));
    expect(calls).toMatchObject(
      call === 'approve'
        ? { approvals: [authorizationId, authorizationId], denials: [] }
        : { approvals: [], denials: [authorizationId, authorizationId] },
    );
  });

  test('Allow on an authorization that has expired since the page opened shows the expired link', async () => {
    const { auth } = fakeAuth({ session: googleSession(), failures: { approve: [authorizationNotFound] } });
    await openConsentPage(auth);

    screen.getByRole('button', { name: 'Allow' }).click();

    expect(await screen.findByText(expiredLink)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('Deny with a rejected session signs out of this browser and shows the sign-in buttons', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession(), failures: { deny: [sessionRejected] } });
    await openConsentPage(auth);

    screen.getByRole('button', { name: 'Deny' }).click();

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeDefined();
    expect(calls).toMatchObject({ denials: [authorizationId], signOuts: [{ scope: 'local' }] });
  });
});
