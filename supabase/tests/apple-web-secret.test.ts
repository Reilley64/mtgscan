import { generateKeyPairSync, verify } from 'node:crypto';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { renewalReminderDue } from '../apple-web-secret/renewal-reminder';

const supabaseDirectory = join(import.meta.dir, '..');
const sixMonthsInSeconds = 15_777_000;
const renewalIssueTitle = 'Renew the Apple web client secret';
const testKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appleWebKey = {
  APPLE_WEB_KEY_ID: 'TESTKEY123',
  APPLE_TEAM_ID: 'TESTTEAM45',
  APPLE_WEB_SERVICES_ID: 'dev.reilley.mtgscan.web',
};

async function runPackageScript(script: string, env: Record<string, string>) {
  const command = Bun.spawn(['bun', 'run', script], {
    cwd: supabaseDirectory,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function testKeyPath() {
  const path = join(await mkdtemp(join(tmpdir(), 'apple-web-secret-')), `AuthKey_${appleWebKey.APPLE_WEB_KEY_ID}.p8`);
  await writeFile(path, testKey.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return path;
}

function decodePart(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString());
}

function daysFromToday(days: number) {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

async function fakeGh(openIssueTitles: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'fake-gh-'));
  const log = join(directory, 'calls.jsonl');
  const gh = join(directory, 'gh');
  await writeFile(log, '');
  await writeFile(
    gh,
    `#!/usr/bin/env bun
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'issue' && args[1] === 'list') console.log(${JSON.stringify(JSON.stringify(openIssueTitles.map((title) => ({ title }))))});
`,
  );
  await chmod(gh, 0o755);
  return {
    path: `${directory}:${process.env.PATH}`,
    calls: async () =>
      (await readFile(log, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
  };
}

describe('the Apple web client secret', () => {
  test('bun run apple-web-secret signs a client secret with the key that is valid for 6 months and prints its expiry date', async () => {
    const issuedAfter = Math.floor(Date.now() / 1000);
    const { exitCode, stdout } = await runPackageScript('apple-web-secret', {
      ...appleWebKey,
      APPLE_WEB_KEY_PATH: await testKeyPath(),
    });
    const issuedBefore = Math.floor(Date.now() / 1000);

    expect(exitCode).toBe(0);
    const [title, secret, expiry, reminder] = stdout.trim().split('\n');
    expect(title).toBe('Apple web client secret:');
    const [header, claims, signature] = secret!.split('.');
    expect(decodePart(header!)).toEqual({ alg: 'ES256', kid: 'TESTKEY123' });
    const { iat, exp, ...identity } = decodePart(claims!);
    expect(identity).toEqual({ iss: 'TESTTEAM45', aud: 'https://appleid.apple.com', sub: 'dev.reilley.mtgscan.web' });
    expect(iat).toBeGreaterThanOrEqual(issuedAfter);
    expect(iat).toBeLessThanOrEqual(issuedBefore);
    expect(exp).toBe(iat + sixMonthsInSeconds);
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: testKey.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true);
    const expiresOn = new Date(exp * 1000).toISOString().slice(0, 10);
    expect(expiry).toBe(`Expires on: ${expiresOn}`);
    expect(reminder).toBe(`Set the reminder: gh variable set APPLE_WEB_SECRET_EXPIRES_ON --body ${expiresOn}`);
  });

  test('bun run apple-web-secret names each setting that is missing and prints no secret', async () => {
    const { exitCode, stdout, stderr } = await runPackageScript('apple-web-secret', {
      APPLE_WEB_KEY_PATH: await testKeyPath(),
      APPLE_WEB_KEY_ID: '',
      APPLE_TEAM_ID: '',
      APPLE_WEB_SERVICES_ID: appleWebKey.APPLE_WEB_SERVICES_ID,
    });

    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Set APPLE_WEB_KEY_ID, APPLE_TEAM_ID.');
  });

  test.each([
    [15, [], false],
    [14, [], false],
    [13, [], true],
    [13, [renewalIssueTitle], false],
    [13, ['Another issue'], true],
    [-1, [], true],
  ])('with %i days left and the open issues %j, the renewal reminder is due: %p', (days, openIssueTitles, due) => {
    expect(renewalReminderDue(daysFromToday(days), new Date(), openIssueTitles)).toBe(due);
  });

  test('the renewal reminder counts whole days in UTC, whatever the time of day', () => {
    expect(renewalReminderDue('2027-04-16', new Date('2027-04-02T00:00:00Z'), [])).toBe(false);
    expect(renewalReminderDue('2027-04-16', new Date('2027-04-02T23:59:59Z'), [])).toBe(false);
    expect(renewalReminderDue('2027-04-16', new Date('2027-04-03T00:00:00Z'), [])).toBe(true);
  });

  test('the reminder workflow opens a ready-for-human issue with the steps when the reminder is due', async () => {
    const gh = await fakeGh([]);
    const expiresOn = daysFromToday(13);
    const { exitCode } = await runPackageScript('apple-web-secret:reminder', {
      APPLE_WEB_SECRET_EXPIRES_ON: expiresOn,
      PATH: gh.path,
    });

    expect(exitCode).toBe(0);
    const [list, create] = await gh.calls();
    expect(list).toEqual([
      'issue',
      'list',
      '--state',
      'open',
      '--search',
      `"${renewalIssueTitle}" in:title`,
      '--json',
      'title',
    ]);
    expect(create!.slice(0, 6)).toEqual([
      'issue',
      'create',
      '--title',
      renewalIssueTitle,
      '--label',
      'ready-for-human',
    ]);
    expect(create![6]).toBe('--body');
    expect(create![7]).toContain(`expires on ${expiresOn}`);
    expect(create![7]).toContain('bun run apple-web-secret');
    expect(create![7]).toContain('gh variable set APPLE_WEB_SECRET_EXPIRES_ON');
  });

  test('the reminder workflow opens no issue when a reminder is already open', async () => {
    const gh = await fakeGh([renewalIssueTitle]);
    const { exitCode } = await runPackageScript('apple-web-secret:reminder', {
      APPLE_WEB_SECRET_EXPIRES_ON: daysFromToday(13),
      PATH: gh.path,
    });

    expect(exitCode).toBe(0);
    expect((await gh.calls()).map((args) => args.slice(0, 2))).toEqual([['issue', 'list']]);
  });

  test('the reminder workflow fails and opens no issue when APPLE_WEB_SECRET_EXPIRES_ON is not a date', async () => {
    const gh = await fakeGh([]);
    const { exitCode, stderr } = await runPackageScript('apple-web-secret:reminder', {
      APPLE_WEB_SECRET_EXPIRES_ON: '',
      PATH: gh.path,
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain('APPLE_WEB_SECRET_EXPIRES_ON must be the date');
    expect((await gh.calls()).map((args) => args[1])).not.toContain('create');
  });
});
