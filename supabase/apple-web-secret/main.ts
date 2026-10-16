import { readFile } from 'node:fs/promises';

import { signAppleWebClientSecret } from './client-secret';

const settings = ['APPLE_WEB_KEY_PATH', 'APPLE_WEB_KEY_ID', 'APPLE_TEAM_ID', 'APPLE_WEB_SERVICES_ID'];

const missing = settings.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(', ')}. README.md (Apple web client secret) has the steps.`);
  process.exit(2);
}

const { secret, expiresOn } = signAppleWebClientSecret(
  {
    privateKey: await readFile(process.env.APPLE_WEB_KEY_PATH!, 'utf8'),
    keyId: process.env.APPLE_WEB_KEY_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
    servicesId: process.env.APPLE_WEB_SERVICES_ID!,
  },
  new Date(),
);

console.log('Apple web client secret:');
console.log(secret);
console.log(`Expires on: ${expiresOn}`);
console.log(`Set the reminder: gh variable set APPLE_WEB_SECRET_EXPIRES_ON --body ${expiresOn}`);
