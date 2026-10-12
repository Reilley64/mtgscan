import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { localSupabaseUrl, testUser } from '@mtgscan/supabase/test-user';

const appFolder = join(import.meta.dir, '..');
const outputFolder = await mkdtemp(join(tmpdir(), 'mtgscan-production-bundle-'));

try {
  const exported = Bun.spawnSync(['bunx', 'expo', 'export', '--platform', 'ios', '--output-dir', outputFolder], {
    cwd: appFolder,
    env: { ...process.env, EXPO_PUBLIC_TEST_SIGN_IN: 'true', EXPO_PUBLIC_SUPABASE_URL: localSupabaseUrl },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (exported.exitCode !== 0) {
    console.error('The production bundle did not build.');
    process.exit(1);
  }
  const bundleFolder = join(outputFolder, '_expo', 'static', 'js', 'ios');
  const bundles = await Promise.all(
    (await readdir(bundleFolder)).map((name) => readFile(join(bundleFolder, name), 'latin1')),
  );
  const bundle = bundles.join('\n');
  if (!bundle.includes('Continue with Google')) {
    console.error('The production bundle has no sign-in screen, so the check proves nothing.');
    process.exit(1);
  }
  const found = [testUser.email, testUser.password, 'Sign in as the test user'].filter((text) => bundle.includes(text));
  if (found.length > 0) {
    console.error(`The production bundle has the test sign-in: ${found.join(', ')}`);
    process.exit(1);
  }
  const catalogFound = ['Open the drawer sheet', 'The title stays at the top.'].filter((text) => bundle.includes(text));
  if (catalogFound.length > 0) {
    console.error(`The production bundle has the primitive catalog: ${catalogFound.join(', ')}`);
    process.exit(1);
  }
  console.log('The production bundle has no test sign-in and no primitive catalog.');
} finally {
  await rm(outputFolder, { recursive: true, force: true });
}
