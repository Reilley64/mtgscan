import {
  AppleAuthenticationUserDetectionStatus,
  type AppleAuthenticationCredential,
  type AppleAuthenticationSignInOptions,
} from 'expo-apple-authentication';
import appleAuthentication from 'expo-apple-authentication/build/ExpoAppleAuthentication';
import { CodedError } from 'expo-modules-core';

const idTokenPrefix = 'apple-id-token-for-nonce:';

function cancellation() {
  return new CodedError('ERR_REQUEST_CANCELED', 'The user canceled the authorization attempt.');
}

function credentialFor({ nonce }: AppleAuthenticationSignInOptions): AppleAuthenticationCredential {
  return {
    user: 'apple-user',
    state: null,
    fullName: null,
    email: null,
    realUserStatus: AppleAuthenticationUserDetectionStatus.LIKELY_REAL,
    identityToken: `${idTokenPrefix}${nonce}`,
    authorizationCode: 'apple-authorization-code',
  };
}

export function appleIdTokenNonce(token: string) {
  return token.startsWith(idTokenPrefix) ? token.slice(idTokenPrefix.length) : null;
}

type AppleAuthenticationModule = {
  requestAsync: (
    options: AppleAuthenticationSignInOptions,
  ) => Promise<AppleAuthenticationCredential>;
};

export function requestAppleSignIn() {
  return jest.spyOn(appleAuthentication as AppleAuthenticationModule, 'requestAsync');
}

export function appleSignInSucceeds() {
  return requestAppleSignIn().mockImplementationOnce(async (options) => credentialFor(options));
}

export function appleSignInIsCancelled() {
  return requestAppleSignIn().mockRejectedValueOnce(cancellation());
}

export function appleSignInFails() {
  return requestAppleSignIn().mockRejectedValueOnce(
    new CodedError('ERR_REQUEST_FAILED', 'The authorization attempt failed.'),
  );
}

export function appleSignInWaits() {
  let cancel = () => {};
  requestAppleSignIn().mockReturnValueOnce(
    new Promise((_, reject) => {
      cancel = () => reject(cancellation());
    }),
  );
  return { cancel: () => cancel() };
}
