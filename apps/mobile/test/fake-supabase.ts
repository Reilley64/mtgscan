import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import type {
  CollectionCopyRow,
  CollectionPage,
  CollectionQuery,
  CollectionTotal,
  CopyDetails,
  CopyProtectedRequest,
  CopyQuery,
  CopyUserTagRequest,
  CreateUserTagRequest,
  DeleteCopyRequest,
  DeleteUserTagRequest,
  RenameUserTagRequest,
  ScanBatch,
  ScanBatchResult,
  ScanBatchStack,
  UserTag,
} from '@mtgscan/supabase/collection';
import { testUser } from '@mtgscan/supabase/test-user';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { act } from 'expo-router/testing-library';

import type { SignInProvider } from '@/auth/sign-in';

import { cardImageUri, cardSets, galleryPrintings, oracleTags, setIconUri } from './card-printings';
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
let collectionCopies: CollectionCopyRow[] = [];
let copyDetails = new Map<string, CopyDetails>();
let failingCopyReads = 0;
let copyDeletes: string[] = [];
let failingCopyDeletes = 0;
let copyProtectedWrites: CopyProtectedRequest[] = [];
let failingCopyWrites = 0;
let userTags: UserTag[] = [];
let nextUserTagNumber = 1;
let copyUserTags = new Map<string, Set<string>>();
let failingUserTagChanges = 0;
let failingUserTagReads = 0;
const emptyCollectionTotal: CollectionTotal = {
  total: '0.00',
  currency: 'USD',
  priced_copies: 0,
  copies: 0,
};
let collectionTotal = emptyCollectionTotal;
let failingCollectionReads = 0;
let collectionSearches: CollectionQuery[] = [];
let collectionSearchAnswer: ((query: CollectionQuery) => CollectionSearchAnswer) | null = null;
let cursorGeneration = 0;
let scanBatchesSent: ScanBatch[] = [];
let addedCopies = new Map<string, string>();
let failingScanBatch: 'before the server adds it' | 'after the server adds it' | null = null;
let heldScanBatch: Promise<void> | null = null;
let heldCollectionReads: Promise<void> | null = null;
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

export type CollectionSearchAnswer = CollectionCopyRow[] | { refusedField: string };

const expiredCursor = { code: 'invalid_cursor', message: 'The cursor has expired. Start the search again.', details: 'cursor' };

function collectionCopiesPage({ rows, cursor, limit = 60, ...search }: CollectionQuery) {
  if (rows !== 'copies') {
    throw new Error('The fake Supabase client searches the collection only for copy rows');
  }
  if (failingCollectionReads > 0) {
    failingCollectionReads -= 1;
    return { data: null, error: { code: 'PGRST000', message: 'Network request failed', details: null } };
  }
  const [generation, offset] = cursor ? cursor.split(':').map(Number) : [cursorGeneration, 0];
  if (generation !== cursorGeneration) {
    return { data: null, error: expiredCursor };
  }
  if (!cursor) {
    collectionSearches = [...collectionSearches, search];
  }
  const answer = collectionSearchAnswer ? collectionSearchAnswer(search) : collectionCopies;
  if ('refusedField' in answer) {
    const { refusedField } = answer;
    return { data: null, error: { code: 'invalid_argument', message: `${refusedField} is not known.`, details: refusedField } };
  }
  const end = offset + limit;
  const page: Pick<CollectionPage<CollectionCopyRow>, 'items' | 'next_cursor' | 'total_count'> = {
    items: answer.slice(offset, end),
    next_cursor: end < answer.length ? `${cursorGeneration}:${end}` : null,
    total_count: cursor ? null : answer.length,
  };
  return { data: page, error: null };
}

const networkFailure = { code: '', message: 'TypeError: Network request failed', details: null, hint: '' };

const copyNotFound = {
  data: null,
  error: { code: 'not_found', message: 'copy_id is not a copy in your collection.', details: 'copy_id' },
};

function ownedCopyDetails(copyId: string) {
  return collectionCopies.some((copy) => copy.copy_id === copyId) ? copyDetails.get(copyId) : undefined;
}

function copyRead({ copy_id }: CopyQuery) {
  if (failingCopyReads > 0) {
    failingCopyReads -= 1;
    return { data: null, error: networkFailure };
  }
  const details = ownedCopyDetails(copy_id);
  return details ? { data: { ...details, user_tags: userTagsOnCopy(copy_id) }, error: null } : copyNotFound;
}

function setCopyProtected(request: CopyProtectedRequest) {
  copyProtectedWrites = [...copyProtectedWrites, request];
  if (failingCopyWrites > 0) {
    failingCopyWrites -= 1;
    return { data: null, error: networkFailure };
  }
  const details = ownedCopyDetails(request.copy_id);
  if (!details) {
    return copyNotFound;
  }
  copyDetails.set(request.copy_id, { ...details, protected: request.protected });
  collectionCopies = collectionCopies.map((copy) =>
    copy.copy_id === request.copy_id ? { ...copy, protected: request.protected } : copy,
  );
  return { data: request, error: null };
}

function byName(a: UserTag, b: UserTag) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function userTagsOnCopy(copyId: string) {
  const onCopy = copyUserTags.get(copyId) ?? new Set();
  return userTags.filter((userTag) => onCopy.has(userTag.user_tag_id)).toSorted(byName);
}

function copiesWithUserTag(userTagId: string) {
  return collectionCopies.filter((copy) => copyUserTags.get(copy.copy_id)?.has(userTagId)).length;
}

function userTagList() {
  if (failingUserTagReads > 0) {
    failingUserTagReads -= 1;
    return { data: null, error: networkFailure };
  }
  const items = userTags.toSorted(byName).map((userTag) => ({ ...userTag, copy_count: copiesWithUserTag(userTag.user_tag_id) }));
  return { data: { items }, error: null };
}

const userTagExists = {
  data: null,
  error: { code: 'user_tag_exists', message: 'You already have a user tag with this name.', details: 'name' },
};

const userTagNotFound = {
  data: null,
  error: { code: 'not_found', message: 'user_tag_id is not one of your user tags.', details: 'user_tag_id' },
};

function failedUserTagChange() {
  if (failingUserTagChanges === 0) {
    return false;
  }
  failingUserTagChanges -= 1;
  return true;
}

function createUserTag({ name }: CreateUserTagRequest) {
  if (failedUserTagChange()) {
    return { data: null, error: networkFailure };
  }
  const trimmed = name.trim();
  if (userTags.some((userTag) => userTag.name.toLowerCase() === trimmed.toLowerCase())) {
    return userTagExists;
  }
  const userTag = { user_tag_id: `user-tag-${nextUserTagNumber++}`, name: trimmed };
  userTags = [...userTags, userTag];
  return { data: userTag, error: null };
}

function renameUserTag({ user_tag_id, name }: RenameUserTagRequest) {
  if (failedUserTagChange()) {
    return { data: null, error: networkFailure };
  }
  const trimmed = name.trim();
  if (!userTags.some((userTag) => userTag.user_tag_id === user_tag_id)) {
    return userTagNotFound;
  }
  if (userTags.some((userTag) => userTag.user_tag_id !== user_tag_id && userTag.name.toLowerCase() === trimmed.toLowerCase())) {
    return userTagExists;
  }
  userTags = userTags.map((userTag) => (userTag.user_tag_id === user_tag_id ? { ...userTag, name: trimmed } : userTag));
  return { data: { user_tag_id, name: trimmed }, error: null };
}

function deleteUserTag({ user_tag_id }: DeleteUserTagRequest) {
  if (failedUserTagChange()) {
    return { data: null, error: networkFailure };
  }
  if (!userTags.some((userTag) => userTag.user_tag_id === user_tag_id)) {
    return userTagNotFound;
  }
  userTags = userTags.filter((userTag) => userTag.user_tag_id !== user_tag_id);
  copyUserTags = new Map([...copyUserTags].map(([copyId, onCopy]) => [copyId, new Set([...onCopy].filter((id) => id !== user_tag_id))]));
  return { data: null, error: null };
}

function setCopyUserTag({ copy_id, user_tag_id, tagged }: CopyUserTagRequest) {
  if (failedUserTagChange()) {
    return { data: null, error: networkFailure };
  }
  if (!ownedCopyDetails(copy_id)) {
    return copyNotFound;
  }
  const onCopy = new Set(copyUserTags.get(copy_id));
  if (tagged) {
    onCopy.add(user_tag_id);
  } else {
    onCopy.delete(user_tag_id);
  }
  copyUserTags = new Map(copyUserTags).set(copy_id, onCopy);
  return { data: null, error: null };
}

function deleteCopy({ copy_id }: DeleteCopyRequest) {
  if (failingCopyDeletes > 0) {
    failingCopyDeletes -= 1;
    return { data: null, error: networkFailure };
  }
  if (!collectionCopies.some((copy) => copy.copy_id === copy_id)) {
    return copyNotFound;
  }
  copyDeletes = [...copyDeletes, copy_id];
  removeCopyFromTheCollection(copy_id);
  return { data: null, error: null };
}

function addToCollection(copies: { copyId: string; stack: ScanBatchStack }[]) {
  for (const { copyId, stack } of copies) {
    const { card_printing_id, finish, condition, language } = stack;
    const printing = galleryPrintings.find((candidate) => candidate.printingId === card_printing_id)!;
    const ofPrinting = collectionCopies.filter((row) => row.printing_id === card_printing_id);
    const copy: CollectionCopyRow = {
      copy_id: copyId,
      printing_id: printing.printingId,
      name: printing.name,
      set: printing.setCode,
      collector_number: printing.collectorNumber,
      rarity: 'common',
      image_uris: [cardImageUri(printing.printingId)],
      finish,
      condition,
      language,
      protected: false,
      price: null,
    };
    collectionCopies = [...ofPrinting, copy, ...collectionCopies.filter((row) => row.printing_id !== card_printing_id)];
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
  const copies = batch.items.flatMap((stack) => stack.copy_ids.map((copyId) => ({ copyId, stack })));
  const newCopies = copies.filter(({ copyId }) => !addedCopies.has(copyId));
  const additionId = newCopies.length > 0 ? `addition-${new Set(addedCopies.values()).size + 1}` : null;
  const addedAt = additionId && new Date(Date.UTC(2026, 9, 13, 10, addedCopies.size)).toISOString();
  if (additionId) {
    addToCollection(newCopies);
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
      ilike: (_column: string, pattern: string) => ({
        order: () => ({
          limit: async (count: number) => ({
            data: cardSets.filter((set) => set.code.startsWith(pattern.replace(/%$/, '').toLowerCase())).slice(0, count),
            error: null,
          }),
        }),
      }),
    }),
  };
}

function oracleTagLookup({ text, limit }: { text: string; limit: number }) {
  const items = oracleTags.filter((tag) => tag.slug.includes(text.toLowerCase())).slice(0, limit);
  return { data: { items }, error: null };
}

export const fakeSupabase = {
  from: cardCatalogTable,
  async rpc(
    name: string,
    args?:
      | { query: CollectionQuery }
      | { query: CopyQuery }
      | { query: { text: string; limit: number } }
      | { batch: ScanBatch }
      | {
          request:
            | DeleteCopyRequest
            | CopyProtectedRequest
            | CreateUserTagRequest
            | CopyUserTagRequest
            | RenameUserTagRequest
            | DeleteUserTagRequest;
        },
  ) {
    if (name === 'list_user_tags') {
      return userTagList();
    }
    if (name === 'create_user_tag' && args && 'request' in args) {
      return createUserTag(args.request as CreateUserTagRequest);
    }
    if (name === 'rename_user_tag' && args && 'request' in args) {
      return renameUserTag(args.request as RenameUserTagRequest);
    }
    if (name === 'delete_user_tag' && args && 'request' in args) {
      return deleteUserTag(args.request as DeleteUserTagRequest);
    }
    if (name === 'set_copy_user_tag' && args && 'request' in args) {
      return setCopyUserTag(args.request as CopyUserTagRequest);
    }
    if (name === 'search_collection' && args && 'query' in args) {
      await heldCollectionReads;
      return collectionCopiesPage(args.query as CollectionQuery);
    }
    if (name === 'search_oracle_tags' && args && 'query' in args) {
      return oracleTagLookup(args.query as { text: string; limit: number });
    }
    if (name === 'get_copy' && args && 'query' in args) {
      return copyRead(args.query as CopyQuery);
    }
    if (name === 'delete_copy' && args && 'request' in args) {
      return deleteCopy(args.request as DeleteCopyRequest);
    }
    if (name === 'set_copy_protected' && args && 'request' in args) {
      return setCopyProtected(args.request as CopyProtectedRequest);
    }
    if (name === 'get_collection_total') {
      return { data: collectionTotal, error: null };
    }
    if (name === 'add_scan_batch' && args && 'batch' in args) {
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

export function ownCollectionCopies(copies: CollectionCopyRow[]) {
  collectionCopies = copies;
}

export function ownCopies(copies: CopyDetails[]) {
  collectionCopies = copies;
  copyDetails = new Map(copies.map((copy) => [copy.copy_id, copy]));
}

export function removeCopyFromTheCollection(copyId: string) {
  collectionCopies = collectionCopies.filter((copy) => copy.copy_id !== copyId);
}

export function copiesDeletedOnTheServer() {
  return copyDeletes;
}

export function failCopyDeletes(count: number) {
  failingCopyDeletes = count;
}

export function ownUserTags(seeds: { name: string; copyIds: string[] }[]) {
  userTags = seeds.map(({ name }, index) => ({ user_tag_id: `user-tag-${index + 1}`, name }));
  nextUserTagNumber = seeds.length + 1;
  copyUserTags = new Map();
  seeds.forEach(({ copyIds }, index) => {
    for (const copyId of copyIds) {
      copyUserTags.set(copyId, new Set(copyUserTags.get(copyId)).add(`user-tag-${index + 1}`));
    }
  });
}

export function failUserTagReads(count: number) {
  failingUserTagReads = count;
}

export function failUserTagChanges(count: number) {
  failingUserTagChanges = count;
}

export function failCopyReads(count: number) {
  failingCopyReads = count;
}

export function failCopyWrites(count: number) {
  failingCopyWrites = count;
}

export function copyProtectedWritesSent() {
  return copyProtectedWrites;
}

export function ownCollectionTotal(total: CollectionTotal) {
  collectionTotal = total;
}

export function failCollectionReads(count: number) {
  failingCollectionReads = count;
}

export function answerCollectionSearches(answer: (query: CollectionQuery) => CollectionSearchAnswer) {
  collectionSearchAnswer = answer;
}

export function collectionSearchesSent() {
  return collectionSearches;
}

export function expireCollectionSearchCursors() {
  cursorGeneration += 1;
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

export function holdCollectionReads() {
  let finish = () => {};
  heldCollectionReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldCollectionReads = null;
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
  collectionCopies = [];
  copyDetails = new Map();
  failingCopyReads = 0;
  copyDeletes = [];
  failingCopyDeletes = 0;
  copyProtectedWrites = [];
  failingCopyWrites = 0;
  userTags = [];
  nextUserTagNumber = 1;
  copyUserTags = new Map();
  failingUserTagChanges = 0;
  failingUserTagReads = 0;
  collectionTotal = emptyCollectionTotal;
  failingCollectionReads = 0;
  collectionSearches = [];
  collectionSearchAnswer = null;
  cursorGeneration = 0;
  scanBatchesSent = [];
  addedCopies = new Map();
  failingScanBatch = null;
  heldScanBatch = null;
  heldCollectionReads = null;
  galleryObjects = new Map();
  offlineGalleryReads = 0;
  publishGallery(publishedGalleryVersion);
  nextSignInEmail = defaultEmail;
  nextSignInError = null;
  testUserSeeded = true;
  listeners.clear();
  users.clear();
}
