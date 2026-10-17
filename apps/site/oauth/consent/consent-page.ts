import {
  currentSignInProviderName,
  type SignInProvider,
  signInProviderNames,
} from '@mtgscan/supabase/sign-in-providers';
import {
  type AuthError,
  type AuthOAuthServerApi,
  isAuthSessionMissingError,
  type OAuthAuthorizationDetails,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

export type ConsentAuth = Pick<SupabaseClient['auth'], 'getSession' | 'signInWithOAuth' | 'signOut'> & {
  oauth: Pick<AuthOAuthServerApi, 'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization'>;
};

type ConsentPage = {
  auth: ConsentAuth;
  root: HTMLElement;
  url: URL;
  navigate: (url: string) => void;
};

type Answer = 'approveAuthorization' | 'denyAuthorization';

const signInButtons: Record<SignInProvider, { logo: string; queryParams?: { [key: string]: string } }> = {
  apple: { logo: '/oauth/consent/apple-logo.svg' },
  google: { logo: '/oauth/consent/google-logo.png', queryParams: { prompt: 'select_account' } },
};

const expiredAuthorizationCodes = ['oauth_authorization_not_found', 'validation_failed'];

const rejectedSessionCodes = ['bad_jwt', 'session_not_found', 'session_expired', 'refresh_token_not_found'];

function authorizationExpired(error: AuthError) {
  return expiredAuthorizationCodes.includes(error.code ?? '');
}

function sessionRejected(error: AuthError) {
  return error.status === 401 || isAuthSessionMissingError(error) || rejectedSessionCodes.includes(error.code ?? '');
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

function button(text: string, className: string, onClick: () => Promise<void>, ...icon: Node[]) {
  const node = element('button', className, ...icon, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function logo(src: string) {
  const image = element('img', '');
  image.src = src;
  image.alt = '';
  return image;
}

function sameSignInHint() {
  return element('p', 'consent-muted', 'Use the same sign-in as in the app');
}

export async function showConsentPage({ auth, root, url, navigate }: ConsentPage) {
  const authorizationId = url.searchParams.get('authorization_id');
  const consentUrl = new URL(url.pathname, url.origin);
  if (authorizationId) consentUrl.searchParams.set('authorization_id', authorizationId);

  function show(...children: Node[]) {
    root.replaceChildren(...children);
  }

  function disableButtons() {
    for (const control of root.querySelectorAll('button')) control.disabled = true;
  }

  function showExpired() {
    show(element('p', 'lead', 'This link has expired. Start again from your AI chat.'));
  }

  function signInButton(provider: SignInProvider) {
    const { logo: logoSrc, queryParams } = signInButtons[provider];
    return button(
      `Continue with ${signInProviderNames[provider]}`,
      `button-${provider}`,
      async () => {
        disableButtons();
        const { data, error } = await auth.signInWithOAuth({
          provider,
          options: { redirectTo: consentUrl.href, skipBrowserRedirect: true, ...(queryParams && { queryParams }) },
        });
        if (error || !data.url) showSignIn(true);
        else navigate(data.url);
      },
      logo(logoSrc),
    );
  }

  function showSignIn(failed = false) {
    show(
      element('h1', '', 'Sign in to mtgscan'),
      sameSignInHint(),
      element('div', 'sign-in-buttons', signInButton('apple'), signInButton('google')),
      ...(failed ? [element('p', 'consent-error', 'Could not start the sign-in. Try again.')] : []),
    );
  }

  function accountCard(user: User) {
    return element(
      'section',
      'consent-card',
      element('p', 'consent-strong', `Signed in with ${currentSignInProviderName(user)}`),
      element('p', 'meta', user.email ?? ''),
      sameSignInHint(),
      button('Switch account', 'button button-secondary', async () => {
        await auth.signOut({ scope: 'local' });
        showSignIn();
      }),
    );
  }

  async function handleFailure(user: User, error: AuthError, retry: () => Promise<void>): Promise<void> {
    if (authorizationExpired(error)) return showExpired();
    if (sessionRejected(error)) {
      await auth.signOut({ scope: 'local' });
      return showSignIn();
    }
    show(
      accountCard(user),
      element(
        'section',
        'consent-card',
        element('p', '', 'Could not reach mtgscan.'),
        button('Try again', 'button', async () => {
          disableButtons();
          await retry();
        }),
      ),
    );
  }

  async function answerAuthorization(user: User, details: OAuthAuthorizationDetails, answer: Answer) {
    disableButtons();
    const { data, error } = await auth.oauth[answer](details.authorization_id, { skipBrowserRedirect: true });
    if (error) await handleFailure(user, error, () => answerAuthorization(user, details, answer));
    else navigate(data.redirect_url);
  }

  function showDetails(user: User, details: OAuthAuthorizationDetails) {
    show(
      accountCard(user),
      element('h1', '', details.client.name),
      element('p', 'consent-muted', `Returns you to ${new URL(details.redirect_uri).host}`),
      element(
        'p',
        'consent-card',
        'Read your cards, collection, decks, and deck history. Plan swaps and add to your buylist. It cannot change your decks or collection.',
      ),
      element(
        'div',
        'actions',
        button('Allow', 'button', () => answerAuthorization(user, details, 'approveAuthorization')),
        button('Deny', 'button button-secondary', () => answerAuthorization(user, details, 'denyAuthorization')),
      ),
    );
  }

  async function loadDetails(user: User, id: string): Promise<void> {
    const { data, error } = await auth.oauth.getAuthorizationDetails(id);
    if (error) return handleFailure(user, error, () => loadDetails(user, id));
    if ('redirect_url' in data) return navigate(data.redirect_url);
    showDetails(user, data);
  }

  if (!authorizationId) return showExpired();
  const {
    data: { session },
  } = await auth.getSession();
  if (!session) return showSignIn();
  await loadDetails(session.user, authorizationId);
}
