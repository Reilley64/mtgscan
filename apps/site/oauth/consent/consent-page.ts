import { currentSignInProviderName } from '@mtgscan/supabase/sign-in-providers';
import type { AuthOAuthServerApi, OAuthAuthorizationDetails, SupabaseClient, User } from '@supabase/supabase-js';

export type ConsentAuth = Pick<SupabaseClient['auth'], 'getSession' | 'signInWithOAuth' | 'signOut'> & {
  oauth: Pick<AuthOAuthServerApi, 'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization'>;
};

type ConsentPage = {
  auth: ConsentAuth;
  root: HTMLElement;
  url: URL;
  navigate: (url: string) => void;
};

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

function googleLogo() {
  const logo = element('img', '');
  logo.src = '/oauth/consent/google-logo.png';
  logo.alt = '';
  return logo;
}

export async function showConsentPage({ auth, root, url, navigate }: ConsentPage) {
  const authorizationId = url.searchParams.get('authorization_id');
  const consentUrl = new URL(url.pathname, url.origin);
  if (authorizationId) consentUrl.searchParams.set('authorization_id', authorizationId);

  function show(...children: Node[]) {
    root.replaceChildren(...children);
  }

  function showExpired() {
    show(element('p', 'lead', 'This link has expired. Start again from your AI chat.'));
  }

  function showSignIn() {
    show(
      element('h1', '', 'Sign in to mtgscan'),
      element('p', 'lead', 'Use the same sign-in as in the app'),
      button(
        'Continue with Google',
        'button-google',
        async () => {
          const { data } = await auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: consentUrl.href,
              skipBrowserRedirect: true,
              queryParams: { prompt: 'select_account' },
            },
          });
          if (data.url) navigate(data.url);
        },
        googleLogo(),
      ),
    );
  }

  async function decide(decision: () => ReturnType<ConsentAuth['oauth']['approveAuthorization']>) {
    for (const control of root.querySelectorAll('button')) control.disabled = true;
    const { data, error } = await decision();
    if (error) showExpired();
    else navigate(data.redirect_url);
  }

  function showDetails(user: User, details: OAuthAuthorizationDetails) {
    show(
      element(
        'section',
        'consent-card',
        element('p', 'consent-strong', `Signed in with ${currentSignInProviderName(user)}`),
        element('p', 'consent-meta', user.email ?? ''),
        element('p', 'consent-muted', 'Use the same sign-in as in the app'),
        button('Switch account', 'button button-secondary', async () => {
          await auth.signOut({ scope: 'local' });
          showSignIn();
        }),
      ),
      element('h1', '', details.client.name),
      element('p', 'consent-muted', `Returns you to ${new URL(details.redirect_uri).host}`),
      element(
        'p',
        'consent-card',
        'Read your cards, collection, decks, and deck history. Suggest deck changes. It cannot change your decks or collection.',
      ),
      element(
        'div',
        'actions',
        button('Allow', 'button', () =>
          decide(() => auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })),
        ),
        button('Deny', 'button button-secondary', () =>
          decide(() => auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true })),
        ),
      ),
    );
  }

  if (!authorizationId) return showExpired();
  const {
    data: { session },
  } = await auth.getSession();
  if (!session) return showSignIn();
  const { data, error } = await auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) return showExpired();
  if ('redirect_url' in data) return navigate(data.redirect_url);
  showDetails(session.user, data);
}
