import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { moduleRoot, run } from './recognizer-command.mjs';

const [app] = process.argv.slice(2);
if (!app) throw new Error('usage: check-libwebp-version.mjs <built mtgscan.app>');

const pinned = (await readFile(path.join(moduleRoot, 'Package.swift'), 'utf8')).match(
  /libwebp-Xcode\.git", exact: "([^"]+)"/,
)?.[1];
if (!pinned) throw new Error('Package.swift pins no libwebp-Xcode version');

async function succeed(command, args, failure) {
  const result = await run(command, args, { output: true });
  if (result.code !== 0) throw new Error(failure);
  return result.stdout.trim();
}

async function buildProbe(directory) {
  const frameworks = path.join(path.resolve(app), 'Frameworks');
  const probe = path.join(directory, 'libwebp-version');
  const architecture = os.arch() === 'arm64' ? 'arm64' : 'x86_64';
  await succeed(
    'xcrun',
    [
      ...['--sdk', 'iphonesimulator', 'swiftc', '-target', `${architecture}-apple-ios17.0-simulator`],
      ...['-I', path.join(moduleRoot, 'ios', 'WebP'), '-F', frameworks, '-framework', 'SDWebImageWebPCoder'],
      ...['-Xlinker', '-rpath', '-Xlinker', frameworks, '-o', probe],
      path.join(moduleRoot, 'scripts', 'libwebp-version.swift'),
    ],
    `the libwebp probe did not build against ${frameworks}/SDWebImageWebPCoder.framework`,
  );
  return probe;
}

async function runInSimulator(probe) {
  const device = await succeed(
    'xcrun',
    ['simctl', 'create', `mtgscan-libwebp-check-${process.pid}`, 'iPhone 16e'],
    'no iPhone 16e Simulator could be created',
  );
  try {
    await succeed('xcrun', ['simctl', 'bootstatus', device, '-b'], 'the Simulator did not boot');
    return await succeed('xcrun', ['simctl', 'spawn', device, probe], 'the libwebp probe failed in the Simulator');
  } finally {
    await run('xcrun', ['simctl', 'shutdown', device]);
    await run('xcrun', ['simctl', 'delete', device]);
  }
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'libwebp-version-'));
let linked;
try {
  linked = await runInSimulator(await buildProbe(scratch));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

if (linked !== pinned) {
  console.error(
    `The app links libwebp ${linked}, but ios/WebP holds the libwebp ${pinned} headers. ` +
      'Copy encode.h, types.h, and COPYING from the new version into ios/WebP, and pin it in Package.swift.',
  );
  process.exit(1);
}
console.log(`The app links libwebp ${linked}, the version of the headers in ios/WebP.`);
