import { expect, test } from 'bun:test';

import { supabaseUrl } from '../oauth/consent/supabase-project';

const headers = await Bun.file(new URL('../_headers', import.meta.url)).text();

function rule(path: string) {
  const block = headers.split(/\n(?=\S)/).find((lines) => lines.startsWith(`${path}\n`));
  return block!
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
}

function contentSecurityPolicy(path: string) {
  const header = rule(path).find((line) => line.startsWith('Content-Security-Policy:'))!;
  const directives = header.slice('Content-Security-Policy:'.length).split(';');
  return Object.fromEntries(
    directives.map((directive) => {
      const [name, ...sources] = directive.trim().split(' ');
      return [name, sources];
    }),
  );
}

test('the consent page CSP adds only its script and the Supabase project to the site CSP', () => {
  expect(rule('/oauth/*')).toContain('! Content-Security-Policy');
  expect(contentSecurityPolicy('/oauth/*')).toEqual({
    ...contentSecurityPolicy('/*'),
    'script-src': ["'self'"],
    'connect-src': [supabaseUrl],
    'form-action': [supabaseUrl],
  });
});
