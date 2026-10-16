import { createPrivateKey, sign } from 'node:crypto';

const appleAudience = 'https://appleid.apple.com';
const clientSecretLifetimeSeconds = 15_777_000;

type AppleWebKey = {
  privateKey: string;
  keyId: string;
  teamId: string;
  servicesId: string;
};

type AppleWebClientSecret = {
  secret: string;
  expiresOn: string;
};

function base64url(json: object) {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

export function signAppleWebClientSecret(key: AppleWebKey, now: Date): AppleWebClientSecret {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + clientSecretLifetimeSeconds;
  const header = base64url({ alg: 'ES256', kid: key.keyId });
  const claims = base64url({ iss: key.teamId, iat: issuedAt, exp: expiresAt, aud: appleAudience, sub: key.servicesId });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(key.privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return {
    secret: `${header}.${claims}.${signature.toString('base64url')}`,
    expiresOn: new Date(expiresAt * 1000).toISOString().slice(0, 10),
  };
}
