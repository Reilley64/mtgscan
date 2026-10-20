import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { isHostedTestUserPassword } from '@mtgscan/supabase/test-user';

import appJson from '../app.json';

const usage = 'Usage: bun run ios:test-device --device <device identifier from `xcrun devicectl list devices`>';
const appFolder = join(import.meta.dir, '..');
const testAppEnvFile = join(homedir(), '.config', 'mtgscan', 'test-app.env');
const derivedDataFolder = join(appFolder, 'ios', 'build');

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { device: { type: 'string' } } });

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!values.device) {
  fail(usage);
}
const localEnvFiles = ['.env.local', '.env.production.local'].filter((name) => existsSync(join(appFolder, name)));
if (localEnvFiles.length > 0) {
  fail(`Move ${localEnvFiles.join(' and ')} out of apps/mobile first. The test app uses hosted Supabase.`);
}
if (!existsSync(testAppEnvFile)) {
  fail(`Create ${testAppEnvFile} with EXPO_PUBLIC_TEST_USER_PASSWORD first.`);
}
const password = (await Bun.file(testAppEnvFile).text()).match(/^EXPO_PUBLIC_TEST_USER_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!isHostedTestUserPassword(password)) {
  fail(`Set EXPO_PUBLIC_TEST_USER_PASSWORD in ${testAppEnvFile} to the hosted test user password.`);
}

const environment = {
  ...process.env,
  DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode-27.1.0.app/Contents/Developer',
  EXPO_NO_GIT_STATUS: '1',
  EXPO_PUBLIC_APP_VARIANT: 'test',
  EXPO_PUBLIC_TEST_USER_PASSWORD: password,
};

async function printHidingPassword(stream, output) {
  let pending = '';
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    for (const line of lines) {
      output.write(`${line.replaceAll(password, '<test user password>')}\n`);
    }
  }
  output.write(pending.replaceAll(password, '<test user password>'));
}

async function run(command) {
  console.log(`$ ${command.join(' ')}`);
  const child = Bun.spawn(command, { cwd: appFolder, env: environment, stdout: 'pipe', stderr: 'pipe' });
  await Promise.all([printHidingPassword(child.stdout, process.stdout), printHidingPassword(child.stderr, process.stderr)]);
  if ((await child.exited) !== 0) {
    fail(`${command[0]} failed.`);
  }
}

await run(['bunx', 'expo', 'prebuild', '--clean', '--platform', 'ios']);
const [workspace] = [...new Bun.Glob('ios/*.xcworkspace').scanSync({ cwd: appFolder, onlyFiles: false })];
const scheme = workspace.slice('ios/'.length, -'.xcworkspace'.length);
await run([
  'xcodebuild',
  '-quiet',
  '-workspace',
  workspace,
  '-scheme',
  scheme,
  '-configuration',
  'Release',
  '-destination',
  'generic/platform=iOS',
  '-derivedDataPath',
  derivedDataFolder,
  '-allowProvisioningUpdates',
  `DEVELOPMENT_TEAM=${appJson.expo.ios.appleTeamId}`,
  'build',
]);
await run([
  'xcrun',
  'devicectl',
  'device',
  'install',
  'app',
  '--device',
  values.device,
  join(derivedDataFolder, 'Build', 'Products', 'Release-iphoneos', `${scheme}.app`),
]);
console.log('mtgscan Test is installed.');
