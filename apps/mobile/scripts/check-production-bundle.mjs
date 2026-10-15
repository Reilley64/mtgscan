import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { localSupabaseUrl, testUser } from '@mtgscan/supabase/test-user';

const appFolder = join(import.meta.dir, '..');
const testSignInText = 'Sign in as the test user';
const sentinelPassword = 'test-app-password-sentinel';

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function exportedBundle(name, appVariant) {
  const outputFolder = await mkdtemp(join(tmpdir(), 'mtgscan-production-bundle-'));
  try {
    const exported = Bun.spawnSync(['bunx', 'expo', 'export', '--platform', 'ios', '--clear', '--output-dir', outputFolder], {
      cwd: appFolder,
      env: {
        ...process.env,
        EXPO_PUBLIC_APP_VARIANT: appVariant,
        EXPO_PUBLIC_TEST_SIGN_IN: 'true',
        EXPO_PUBLIC_SUPABASE_URL: localSupabaseUrl,
        EXPO_PUBLIC_TEST_USER_PASSWORD: sentinelPassword,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (exported.exitCode !== 0) {
      fail(`The ${name} did not build.`);
    }
    const bundleFolder = join(outputFolder, '_expo', 'static', 'js', 'ios');
    const bundles = await Promise.all(
      (await readdir(bundleFolder)).map((file) => readFile(join(bundleFolder, file), 'latin1')),
    );
    return bundles.join('\n');
  } finally {
    await rm(outputFolder, { recursive: true, force: true });
  }
}

const bundle = await exportedBundle('production bundle', '');
if (!bundle.includes('Continue with Google')) {
  fail('The production bundle has no sign-in screen, so the check proves nothing.');
}
const found = [testUser.email, testUser.password, sentinelPassword, testSignInText].filter((text) => bundle.includes(text));
if (found.length > 0) {
  fail(`The production bundle has the test sign-in: ${found.join(', ')}`);
}
const catalogFound = ['Open the drawer sheet', 'The title stays at the top.', 'The footer stays at the bottom'].filter((text) =>
  bundle.includes(text),
);
if (catalogFound.length > 0) {
  fail(`The production bundle has the primitive catalog: ${catalogFound.join(', ')}`);
}
console.log('The production bundle has no test sign-in and no primitive catalog.');

const testAppBundle = await exportedBundle('test app bundle', 'test');
if (!testAppBundle.includes(testSignInText)) {
  fail('The test app bundle has no test sign-in.');
}
console.log('The test app bundle has the test sign-in.');
