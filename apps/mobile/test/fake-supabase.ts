import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import type {
  CollectionPrintingRow,
  CollectionPrintingsQuery,
  ScanBatch,
  ScanBatchResult,
} from '@mtgscan/supabase/collection';
import { testUser } from '@mtgscan/supabase/test-user';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { act } from 'expo-router/testing-library';

import type { SignInProvider } from '@/auth/sign-in';

import { cardImageUri, galleryPrintings, setIconUri } from './card-printings';
import { appleIdTokenNonce } from './fake-apple';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export type FakeAccount = {
  provider: SignInProvider | 'email';
  email: string;
};

const defaultEmail = 'player@example.com';
let session: Session | null = null;
let nextSignInEmail = defaultEmail;
let nextSignInError: AuthError | null = null;
let testUserSeeded = true;
const listeners = new Set<AuthListener>();
const users = new Map<string, User>();
let collectionPrintings: CollectionPrintingRow[] = [];
let failingCollectionReads = 0;
let scanBatchesSent: ScanBatch[] = [];
let addedCopies = new Map<string, string>();
let failingScanBatch: 'before the server adds it' | 'after the server adds it' | null = null;
let heldScanBatch: Promise<void> | null = null;
let galleryObjects = new Map<string, string>();
let offlineGalleryReads = 0;

export const publishedGalleryVersion = '20261012-cf1753';
export const galleryPartNames = [
  'base-gallery-1.zlib',
  'base-gallery-2.zlib',
  'base-printing-list-1.zlib',
];

const issuers: Record<FakeAccount['provider'], string | undefined> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
  email: undefined,
};

function userSignedIn({ provider, email }: FakeAccount): User {
  const user = users.get(email) ?? {
    id: `user-${email}`,
    aud: 'authenticated',
    email,
    app_metadata: { provider, providers: [] },
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
  const providers: string[] = user.app_metadata.providers ?? [];
  const signedInUser: User = {
    ...user,
    app_metadata: {
      ...user.app_metadata,
      providers: providers.includes(provider) ? providers : [...providers, provider],
    },
    user_metadata: { ...user.user_metadata, iss: issuers[provider], email },
  };
  users.set(email, signedInUser);
  return signedInUser;
}

function sessionFor(account: FakeAccount): Session {
  const user = userSignedIn(account);
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  };
}

async function nonceMatches(provider: SignInProvider, token: string, nonce: string | undefined) {
  if (provider !== 'apple') {
    return true;
  }
  return (
    nonce !== undefined &&
    appleIdTokenNonce(token) === (await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce))
  );
}

function collectionPrintingsPage({ cursor, limit = 60 }: CollectionPrintingsQuery) {
  if (failingCollectionReads > 0) {
    failingCollectionReads -= 1;
    return { data: null, error: { code: 'PGRST000', message: 'Network request failed', details: null } };
  }
  const start = cursor ? Number(cursor) : 0;
  const end = start + limit;
  return {
    data: {
      items: collectionPrintings.slice(start, end),
      next_cursor: end < collectionPrintings.length ? String(end) : null,
    },
    error: null,
  };
}

const networkFailure = { code: '', message: 'TypeError: Network request failed', details: null, hint: '' };

function addToCollection(printingIds: string[], addedAt: string) {
  for (const printingId of printingIds) {
    const printing = galleryPrintings.find((candidate) => candidate.printingId === printingId)!;
    const owned = collectionPrintings.find((row) => row.printing_id === printing.printingId);
    collectionPrintings = [
      {
        printing_id: printing.printingId,
        name: printing.name,
        set: printing.setCode,
        collector_number: printing.collectorNumber,
        image_uris: [cardImageUri(printing.printingId)],
        owned_quantity: (owned?.owned_quantity ?? 0) + 1,
        latest_addition_at: addedAt,
      },
      ...collectionPrintings.filter((row) => row !== owned),
    ];
  }
}

async function addScanBatch(batch: ScanBatch) {
  scanBatchesSent = [...scanBatchesSent, batch];
  const held = heldScanBatch;
  heldScanBatch = null;
  await held;
  const failure = failingScanBatch;
  failingScanBatch = null;
  if (failure === 'before the server adds it') {
    return { data: null, error: networkFailure };
  }
  const copies = batch.items.flatMap((item) => item.copy_ids.map((copyId) => ({ copyId, item })));
  const newCopies = copies.filter(({ copyId }) => !addedCopies.has(copyId));
  const additionId = newCopies.length > 0 ? `addition-${new Set(addedCopies.values()).size + 1}` : null;
  const addedAt = additionId && new Date(Date.UTC(2026, 9, 13, 10, addedCopies.size)).toISOString();
  if (additionId && addedAt) {
    addToCollection(
      newCopies.map(({ item }) => item.card_printing_id),
      addedAt,
    );
    newCopies.forEach(({ copyId }) => addedCopies.set(copyId, additionId));
  }
  const result: ScanBatchResult = {
    addition_id: additionId,
    added_at: addedAt,
    copy_count: newCopies.length,
    items: [],
    copies: copies.map(({ copyId }) => ({
      copy_id: copyId,
      addition_id: addedCopies.get(copyId)!,
      collection_entry_id: null,
      replayed: addedCopies.get(copyId) !== additionId,
    })),
  };
  return failure ? { data: null, error: networkFailure } : { data: result, error: null };
}

const offline = { name: 'StorageUnknownError', message: 'Network request failed' };

function galleryBucket(bucket: string) {
  if (bucket !== 'gallery') {
    throw new Error(`The fake Supabase client has no ${bucket} bucket`);
  }
  return {
    async download(path: string) {
      if (offlineGalleryReads > 0) {
        offlineGalleryReads -= 1;
        return { data: null, error: offline };
      }
      const text = session ? galleryObjects.get(path) : undefined;
      return text === undefined
        ? { data: null, error: { name: 'StorageApiError', message: 'Object not found' } }
        : { data: new Blob([text]), error: null };
    },
    async createSignedUrls(paths: string[], expiresIn: number) {
      return {
        data: paths.map((path) => ({
          path,
          signedUrl: `https://storage.example/gallery/${path}?expires=${expiresIn}`,
          error: null,
        })),
        error: null,
      };
    },
  };
}

function notify(event: AuthChangeEvent) {
  listeners.forEach((listener) => listener(event, session));
}

function cardCatalogRows(table: string, ids: string[]) {
  switch (table) {
    case 'card_printings':
      return galleryPrintings
        .filter((printing) => ids.includes(printing.printingId))
        .map((printing) => ({ id: printing.printingId, image_uris: [cardImageUri(printing.printingId)] }));
    case 'card_sets':
      return ids.flatMap((code) => {
        const icon = setIconUri(code);
        return icon ? [{ code, icon_svg_uri: icon }] : [];
      });
    default:
      throw new Error(`The fake Supabase client has no ${table} table`);
  }
}

function cardCatalogTable(table: string) {
  return {
    select: () => ({
      in: async (_column: string, ids: string[]) => ({ data: cardCatalogRows(table, ids), error: null }),
    }),
  };
}

export const fakeSupabase = {
  from: cardCatalogTable,
  async rpc(name: string, args: { query: CollectionPrintingsQuery } | { batch: ScanBatch }) {
    if (name === 'list_collection_printings' && 'query' in args) {
      return collectionPrintingsPage(args.query);
    }
    if (name === 'add_scan_batch' && 'batch' in args) {
      return addScanBatch(args.batch);
    }
    throw new Error(`The fake Supabase client has no ${name} function`);
  },
  storage: { from: galleryBucket },
  auth: {
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      void Promise.resolve().then(() => listener('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async startAutoRefresh() {},
    async stopAutoRefresh() {},
    async signInWithIdToken({
      provider,
      token,
      nonce,
    }: {
      provider: SignInProvider;
      token: string;
      nonce?: string;
    }) {
      if (!(await nonceMatches(provider, token, nonce))) {
        const error = new AuthApiError('Nonces mismatch', 400, 'bad_jwt');
        return { data: { session: null, user: null }, error };
      }
      if (nextSignInError) {
        const error = nextSignInError;
        nextSignInError = null;
        return { data: { session: null, user: null }, error };
      }
      session = sessionFor({ provider, email: nextSignInEmail });
      notify('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      if (!testUserSeeded || email !== testUser.email || password !== testUser.password) {
        const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
        return { data: { session: null, user: null }, error };
      }
      session = sessionFor({ provider: 'email', email });
      notify('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    },
    async signOut() {
      session = null;
      notify('SIGNED_OUT');
      return { error: null };
    },
  },
};

export function startSignedIn(account: FakeAccount = { provider: 'google', email: defaultEmail }) {
  session = sessionFor(account);
}

export function signInNextWithEmail(email: string) {
  nextSignInEmail = email;
}

export function failNextSignIn(error: AuthError) {
  nextSignInError = error;
}

export function testUserIsNotSeeded() {
  testUserSeeded = false;
}

export function ownCollectionPrintings(printings: CollectionPrintingRow[]) {
  collectionPrintings = printings;
}

export function failCollectionReads(count: number) {
  failingCollectionReads = count;
}

export function scanBatchesSentToTheServer() {
  return scanBatchesSent;
}

export function failNextScanBatchCommit(when: NonNullable<typeof failingScanBatch>) {
  failingScanBatch = when;
}

export function holdNextScanBatchCommit() {
  let finish = () => {};
  heldScanBatch = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      await act(async () => finish());
    },
  };
}

export function publishGallery(version: string, partNames: string[] = galleryPartNames) {
  galleryObjects = new Map(galleryObjects);
  galleryObjects.set('published.json', JSON.stringify({ formatVersion: 1, version, manifest: `${version}/manifest.json` }));
  galleryObjects.set(
    `${version}/manifest.json`,
    JSON.stringify({ formatVersion: 1, version, parts: partNames.map((name) => ({ name })) }),
  );
}

export function uploadUnpublishedGallery(version: string) {
  galleryObjects.set(`${version}/manifest.json`, JSON.stringify({ formatVersion: 1, version, parts: [] }));
}

export function galleryStorageIsOffline(reads: number) {
  offlineGalleryReads = reads;
}

export function resetFakeSupabase() {
  session = null;
  collectionPrintings = [];
  failingCollectionReads = 0;
  scanBatchesSent = [];
  addedCopies = new Map();
  failingScanBatch = null;
  heldScanBatch = null;
  galleryObjects = new Map();
  offlineGalleryReads = 0;
  publishGallery(publishedGalleryVersion);
  nextSignInEmail = defaultEmail;
  nextSignInError = null;
  testUserSeeded = true;
  listeners.clear();
  users.clear();
}
