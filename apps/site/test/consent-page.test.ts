import { screen, waitFor } from '@testing-library/dom';
import { describe, expect, test } from 'bun:test';

import { type ConsentAuth, showConsentPage } from '../oauth/consent/consent-page';
import { authorizationId, chatGptDetails, consentPageUrl, fakeAuth, googleSession } from './fake-auth';

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

describe('consent page', () => {
  test('a link with no authorization_id has expired and shows no buttons', async () => {
    await openConsentPage(fakeAuth({ session: googleSession() }).auth, '');

    expect(screen.getByText(expiredLink)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('an expired authorization shows the expired link and no buttons', async () => {
    await openConsentPage(fakeAuth({ session: googleSession(), details: 'expired' }).auth);

    expect(screen.getByText(expiredLink)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('signed out, Continue with Google signs in with a redirect back to the consent page', async () => {
    const { auth, calls } = fakeAuth();
    const navigations = await openConsentPage(auth);

    expect(screen.getByText('Use the same sign-in as in the app')).toBeDefined();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Continue with Google']);
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

  test('signed in, it shows the account, the client, what the client can do, Allow, and Deny', async () => {
    await openConsentPage(fakeAuth({ session: googleSession() }).auth);

    expect(screen.getByText('Signed in with Google')).toBeDefined();
    expect(screen.getByText('player@example.com')).toBeDefined();
    expect(screen.getByText('Use the same sign-in as in the app')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeDefined();
    expect(screen.getByText('Returns you to chatgpt.com')).toBeDefined();
    expect(screen.getByText(permissions)).toBeDefined();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Switch account',
      'Allow',
      'Deny',
    ]);
  });

  test('the client host comes from the redirect URI, not the client name', async () => {
    const details = { ...chatGptDetails, redirect_uri: 'https://chatgpt.example.net:8443/callback' };
    await openConsentPage(fakeAuth({ session: googleSession(), details }).auth);

    expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeDefined();
    expect(screen.getByText('Returns you to chatgpt.example.net:8443')).toBeDefined();
  });

  test('Allow approves the authorization and follows the redirect that Supabase returns', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Allow' }).click();

    await waitFor(() =>
      expect(navigations).toEqual(['https://chatgpt.com/connector_platform_oauth_redirect?code=code-1&state=state-1']),
    );
    expect(calls).toMatchObject({ approvals: [authorizationId], denials: [] });
  });

  test('Deny denies the authorization and sends the client access_denied', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    const navigations = await openConsentPage(auth);

    screen.getByRole('button', { name: 'Deny' }).click();

    await waitFor(() =>
      expect(navigations).toEqual([
        'https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=state-1',
      ]),
    );
    expect(calls).toMatchObject({ approvals: [], denials: [authorizationId] });
  });

  test('Switch account signs out of this browser only and shows the sign-in button', async () => {
    const { auth, calls } = fakeAuth({ session: googleSession() });
    await openConsentPage(auth);

    screen.getByRole('button', { name: 'Switch account' }).click();

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeDefined();
    expect(screen.queryByText('Signed in with Google')).toBeNull();
    expect(calls.signOuts).toEqual([{ scope: 'local' }]);
  });

  test('a client the user already allowed goes straight back to its redirect', async () => {
    const details = { redirect_url: 'https://chatgpt.com/connector_platform_oauth_redirect?code=code-2' };
    const navigations = await openConsentPage(fakeAuth({ session: googleSession(), details }).auth);

    expect(navigations).toEqual([details.redirect_url]);
  });
});
