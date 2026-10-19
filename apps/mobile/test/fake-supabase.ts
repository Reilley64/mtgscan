import {
  AuthApiError,
  type AuthChangeEvent,
  type AuthError,
  type OAuthGrant,
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
  CurrentPrice,
  CurrentPriceRow,
  CurrentPricesQuery,
  DeleteCopyRequest,
  DeleteUserTagRequest,
  RenameUserTagRequest,
  ScanBatch,
  ScanBatchResult,
  ScanBatchStack,
  UserTag,
} from '@mtgscan/supabase/collection';
import type { ExchangeRate } from '@mtgscan/supabase/converted-prices';
import type {
  AddDeckCardPreviewQuery,
  AddDeckCardRequest,
  BasicLandCardList,
  ChangeBasicLandRequest,
  CopyHeldFor,
  CreateDeckRequest,
  Deck,
  DeckBasicLand,
  DeckCard,
  DeckChange,
  DeckChangeEffect,
  DeckChangesQuery,
  DeckEvaluation,
  DeckQuery,
  DeleteDeckRequest,
  MarkDeckUsedRequest,
  NeedsYouCounts,
  RemoveDeckCardRequest,
  RenameDeckRequest,
  RevertDeckChangesRequest,
  RevertPreview,
  RevertPreviewQuery,
  SetDeckCommanderRequest,
  SetDeckPriorityRequest,
  Violation,
} from '@mtgscan/supabase/decks';
import type {
  ClosePlannedSwapRequest,
  PlannedSwap,
  PlannedSwapsQuery,
  SwapInPlannedSwapRequest,
  SwapInPlannedSwapsRequest,
} from '@mtgscan/supabase/planned-swaps';
import type {
  BuylistCard,
  BuylistQuery,
  CloseBuylistCardRequest,
  FreeCopiesQuery,
  FreeCopy,
  MarkBuylistCardBoughtRequest,
} from '@mtgscan/supabase/buylist';
import type { SetDetails, SetQuery, SetRow } from '@mtgscan/supabase/sets';
import type { SignInProvider } from '@mtgscan/supabase/sign-in-providers';
import { testUser } from '@mtgscan/supabase/test-user';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { act } from 'expo-router/testing-library';

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
let testUserPassword = testUser.password;
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
let decks: Deck[] = [];
let deckClock = 0;
let deckWrites: { name: string; request: object }[] = [];
let failingDeckReads = 0;
let failingDeckWrites = 0;
let deckChanges = new Map<string, DeckChange[]>();
let failingDeckChangeReads = 0;
let revertPreviews = new Map<string, Omit<RevertPreview, 'revision'>>();
let addPreviewEffects = new Map<string, DeckChangeEffect>();
let addPreviewQueries: AddDeckCardPreviewQuery[] = [];
let failingAddPreviews = 0;
let heldAddPreviews: Promise<void> | null = null;
let plannedSwaps: PlannedSwap[] = [];
let plannedSwapQueriesSent: PlannedSwapsQuery[] = [];
let thirdCommanderSwaps = new Set<string>();
let failingNeedsYouReads = 0;
let buylistCards: BuylistCard[] = [];
let buylistQueriesSent: BuylistQuery[] = [];
let freeCopies = new Map<string, FreeCopy[]>();
let failingFreeCopyReads = 0;
const emptyCollectionTotal: CollectionTotal = {
  total: '0.00',
  currency: 'USD',
  priced_copies: 0,
  copies: 0,
  stale: false,
  prices_observed_at: null,
};
let collectionTotal = emptyCollectionTotal;
let priceReads: PriceRead[] = [];
const wholeUnitCurrencies = ['ISK', 'JPY', 'KRW'];
const testExchangeRates: Record<string, string> = { AUD: '1.5234', EUR: '0.93', HUF: '324.52', IDR: '17921', JPY: '151.37' };
export const testRateDate = '2026-10-12';
const frankfurterCurrencies = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
];
let exchangeRates = exchangeRatesOf(frankfurterCurrencies);
let exchangeRateReads = 0;
let failingExchangeRateReads = 0;
let failingCollectionReads = 0;
let collectionSearches: CollectionQuery[] = [];
let collectionSearchAnswer: ((query: CollectionQuery) => CollectionSearchAnswer) | null = null;
let cursorGeneration = 0;
let scanBatchesSent: ScanBatch[] = [];
let addedCopies = new Map<string, string>();
let failingScanBatch: 'before the server adds it' | 'after the server adds it' | null = null;
let heldScanBatch: Promise<void> | null = null;
let heldCollectionReads: Promise<void> | null = null;
let heldDeckReads: Promise<void> | null = null;
let sets: SetRow[] = [];
let setReads = 0;
let failingSetReads = 0;
let heldSetReads: Promise<void> | null = null;
let setPages = new Map<string, SetDetails>();
let setPageReads: string[] = [];
let failingSetPageReads = 0;
let heldSetPageReads: Promise<void> | null = null;
let heldDeckListReads: Promise<void> | null = null;
let heldNeedsYouReads: Promise<void> | null = null;
let galleryObjects = new Map<string, string>();
let offlineGalleryReads = 0;
let currentPrices: Map<string, CurrentPrice | null> | null = null;
let currentPriceReads: CurrentPricesQuery[] = [];
let failingCurrentPriceReads = 0;
let heldCurrentPriceReads: Promise<void> | null = null;
let aiClients: OAuthGrant[] = [];
let failingAiClientReads = 0;
let aiClientRevokes: string[] = [];
let failingAiClientRevokes = 0;
let heldAiClientRevokes: Promise<void> | null = null;

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

type PriceRead = { read: 'search_collection' | 'get_collection_total' | 'get_copy' | 'get_current_prices'; query: object };

const expiredCursor = { code: 'invalid_cursor', message: 'The cursor has expired. Start the search again.', details: 'cursor' };

function collectionCopiesPage(query: CollectionQuery) {
  const { rows, cursor, limit = 60, ...search } = query;
  priceReads = [...priceReads, { read: 'search_collection', query }];
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

async function setList() {
  setReads += 1;
  await heldSetReads;
  if (failingSetReads > 0) {
    failingSetReads -= 1;
    return { data: null, error: networkFailure };
  }
  return { data: { items: sets }, error: null };
}

async function setPageRead({ code }: SetQuery) {
  setPageReads = [...setPageReads, code];
  await heldSetPageReads;
  if (failingSetPageReads > 0) {
    failingSetPageReads -= 1;
    return { data: null, error: networkFailure };
  }
  const set = setPages.get(code);
  if (!set) {
    return { data: null, error: { code: 'not_found', message: 'code is not a released set in the card catalog.', details: 'code' } };
  }
  return { data: set, error: null };
}

function collectionTotalRead(query: object) {
  priceReads = [...priceReads, { read: 'get_collection_total', query }];
  return { data: collectionTotal, error: null };
}

function exchangeRatesOf(currencies: string[], rateDate = testRateDate): ExchangeRate[] {
  return currencies.map((currency) => ({
    currency,
    rate: currency === 'USD' ? '1' : (testExchangeRates[currency] ?? '1.25'),
    rate_date: currency === 'USD' ? null : rateDate,
    minor_unit_digits: wholeUnitCurrencies.includes(currency) ? 0 : 2,
  }));
}

function exchangeRateList() {
  exchangeRateReads += 1;
  if (failingExchangeRateReads > 0) {
    failingExchangeRateReads -= 1;
    return { data: null, error: networkFailure };
  }
  return { data: { items: exchangeRates }, error: null };
}

function currentPriceKey({ printing_id, finish }: Pick<CurrentPriceRow, 'printing_id' | 'finish'>) {
  return `${printing_id}|${finish}`;
}

async function currentPricesRead(query: CurrentPricesQuery) {
  currentPriceReads = [...currentPriceReads, query];
  priceReads = [...priceReads, { read: 'get_current_prices', query }];
  await heldCurrentPriceReads;
  if (!currentPrices || failingCurrentPriceReads > 0) {
    failingCurrentPriceReads = Math.max(failingCurrentPriceReads - 1, 0);
    return { data: null, error: networkFailure };
  }
  const known = currentPrices;
  const items: CurrentPriceRow[] = query.items.map((item) => ({ ...item, price: known.get(currentPriceKey(item)) ?? null }));
  return { data: { items }, error: null };
}

const copyNotFound = {
  data: null,
  error: { code: 'not_found', message: 'copy_id is not a copy in your collection.', details: 'copy_id' },
};

function ownedCopyDetails(copyId: string) {
  return collectionCopies.some((copy) => copy.copy_id === copyId) ? copyDetails.get(copyId) : undefined;
}

function copyRead(query: CopyQuery) {
  const { copy_id } = query;
  priceReads = [...priceReads, { read: 'get_copy', query }];
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

function nextDeckTime() {
  deckClock += 1;
  return new Date(Date.UTC(2026, 9, 15, 9, deckClock)).toISOString();
}

const deckNotFound = {
  data: null,
  error: { code: 'not_found', message: 'deck_id is not one of your decks.', details: 'deck_id' },
};

function failedDeckRead() {
  if (failingDeckReads === 0) {
    return false;
  }
  failingDeckReads -= 1;
  return true;
}

function failedDeckWrite() {
  if (failingDeckWrites === 0) {
    return false;
  }
  failingDeckWrites -= 1;
  return true;
}

const basicLandNames = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
  'Snow-Covered Wastes',
];

export function basicLandOracleId(name: string) {
  return `oracle-${name.toLowerCase().replaceAll(' ', '-')}`;
}

export function basicLandsOf(counts: Record<string, number> = {}): DeckBasicLand[] {
  return basicLandNames.map((name) => ({
    oracle_id: basicLandOracleId(name),
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${basicLandOracleId(name)}.jpg`],
    count: counts[name] ?? 0,
  }));
}

const rulesDataAt = '2026-10-12T06:00:00.000Z';

function cardCountText(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

function deckSizeViolations(cardCount: number): Violation[] {
  if (cardCount === 100) {
    return [];
  }
  const hint = cardCount < 100 ? `Add ${cardCountText(100 - cardCount)}.` : `Remove ${cardCountText(cardCount - 100)}.`;
  return [{ rule: 'deck_size', citation: 'CR 903.5a', message: `${cardCount} of 100 cards.`, hint, cards: [] }];
}

function judgeDeck(deck: Omit<Deck, 'evaluation'>): DeckEvaluation | null {
  if (deck.card_count === 0) {
    return null;
  }
  const violations: Violation[] = [
    ...(deck.commanders.length === 0
      ? [{ rule: 'no_commander' as const, citation: 'CR 903.3', message: 'This deck has no commander.', hint: null, cards: [] }]
      : []),
    ...deckSizeViolations(deck.card_count),
  ];
  return {
    validity: violations.length > 0 ? 'invalid' : 'valid',
    validity_stale: false,
    bracket_stale: false,
    violations,
    undetermined: [],
    chosen_color: null,
    estimated_bracket: 2,
    bracket_signals: [{ kind: 'game_changers', source: 'official', count: 0, lowest_bracket: 2, cards: [] }],
    missing_signal_count: 0,
    revision: deck.revision,
    catalog_at: rulesDataAt,
    oracle_tags_at: rulesDataAt,
    commander_spellbook_at: rulesDataAt,
    judged_at: deck.last_used_at,
    validity_rules_data_at: rulesDataAt,
    bracket_rules_data_at: rulesDataAt,
    no_oracle_tag_data: false,
    no_combo_data: false,
  };
}

function judged(deck: Omit<Deck, 'evaluation'>): Deck {
  return { ...deck, evaluation: judgeDeck(deck) };
}

function deckList() {
  if (failedDeckRead()) {
    return { data: null, error: networkFailure };
  }
  const items = decks
    .toSorted((a, b) => b.last_used_at.localeCompare(a.last_used_at) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map(({ revision, created_at, cards, basic_lands, evaluation, ...row }) => ({
      ...row,
      evaluation: evaluation && {
        validity: evaluation.validity,
        validity_stale: evaluation.validity_stale,
        estimated_bracket: evaluation.estimated_bracket,
        bracket_stale: evaluation.bracket_stale,
      },
      needs_you_count: openNeedsYouItems().filter((item) => item.deck_id === row.deck_id).length,
    }));
  return { data: { items }, error: null };
}

function deckRead({ deck_id }: DeckQuery) {
  if (failedDeckRead()) {
    return { data: null, error: networkFailure };
  }
  const deck = decks.find((candidate) => candidate.deck_id === deck_id);
  if (!deck) {
    return deckNotFound;
  }
  const plannedOut = new Set(
    plannedSwaps
      .filter((swap) => swap.status === 'open' && swap.deck_id === deck_id)
      .flatMap((swap) => (swap.outgoing?.kind === 'copy' ? [swap.outgoing.copy_id] : [])),
  );
  return { data: { ...deck, cards: deck.cards.map((card) => ({ ...card, planned_out: plannedOut.has(card.copy_id) })) }, error: null };
}

function openNeedsYouItems() {
  return [...plannedSwaps, ...buylistCards].filter((item) => item.status === 'open');
}

function needsYouCounts(): { data: NeedsYouCounts; error: null } {
  const items = openNeedsYouItems();
  const deckIds = [...new Set(items.map((item) => item.deck_id))];
  return {
    data: {
      total: items.length,
      decks: deckIds.map((deckId) => ({ deck_id: deckId, count: items.filter((item) => item.deck_id === deckId).length })),
    },
    error: null,
  };
}

const deckChangePageSize = 20;

function deckChangeList({ deck_id, cursor }: DeckChangesQuery) {
  if (failingDeckChangeReads > 0) {
    failingDeckChangeReads -= 1;
    return { data: null, error: networkFailure };
  }
  if (!decks.some((deck) => deck.deck_id === deck_id)) {
    return deckNotFound;
  }
  const [generation, offset] = cursor ? cursor.split(':').map(Number) : [cursorGeneration, 0];
  if (generation !== cursorGeneration) {
    return { data: null, error: expiredCursor };
  }
  const changes = deckChanges.get(deck_id) ?? [];
  const end = offset + deckChangePageSize;
  return {
    data: { items: changes.slice(offset, end), next_cursor: end < changes.length ? `${cursorGeneration}:${end}` : null },
    error: null,
  };
}

function revertPreviewRead({ deck_id, deck_change_id }: RevertPreviewQuery) {
  if (failedDeckRead()) {
    return { data: null, error: networkFailure };
  }
  const deck = decks.find((candidate) => candidate.deck_id === deck_id);
  const preview = revertPreviews.get(deck_change_id);
  return deck && preview ? { data: { ...preview, revision: deck.revision }, error: null } : deckNotFound;
}

async function addDeckCardPreviewRead(query: AddDeckCardPreviewQuery) {
  addPreviewQueries = [...addPreviewQueries, query];
  await heldAddPreviews;
  if (failingAddPreviews > 0) {
    failingAddPreviews -= 1;
    return { data: null, error: networkFailure };
  }
  const items = decks.map((deck) => ({ deck_id: deck.deck_id, effect: addPreviewEffects.get(deck.deck_id) ?? null }));
  return { data: { items }, error: null };
}

const staleRevision = {
  data: null,
  error: { code: 'stale_revision', message: 'expected_revision is not the deck revision.', details: 'expected_revision' },
};

function revertDeckChanges(request: RevertDeckChangesRequest) {
  deckWrites = [...deckWrites, { name: 'revert_deck_changes', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const deck = decks.find((candidate) => candidate.deck_id === request.deck_id);
  const changes = deckChanges.get(request.deck_id) ?? [];
  const reverted = changes.find((change) => change.deck_change_id === request.deck_change_id);
  if (!deck || !reverted) {
    return deckNotFound;
  }
  if (request.expected_revision !== deck.revision) {
    return staleRevision;
  }
  const revision = deck.revision + 1;
  const revert: DeckChange = {
    deck_change_id: `deck-change-${revision}`,
    revision,
    kind: 'revert',
    changed_at: nextDeckTime(),
    reverted: false,
    reason: null,
    client_name: null,
    lines: revertPreviews.get(request.deck_change_id)!.lines,
  };
  saveDeck({ ...deck, revision, last_used_at: revert.changed_at });
  ownDeckChanges(request.deck_id, [
    revert,
    ...changes.map((change) => (change.revision >= reverted.revision ? { ...change, reverted: true } : change)),
  ]);
  return { data: { deck_id: deck.deck_id, revision }, error: null };
}

function createDeck(request: CreateDeckRequest) {
  deckWrites = [...deckWrites, { name: 'create_deck', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const time = nextDeckTime();
  const deck: Deck = {
    deck_id: `deck-${decks.length + 1}`,
    name: request.name.trim(),
    priority: 'medium',
    card_count: 0,
    commanders: [],
    last_used_at: time,
    revision: 0,
    created_at: time,
    cards: [],
    basic_lands: basicLandsOf(),
    evaluation: null,
  };
  decks = [...decks, deck];
  return { data: { deck_id: deck.deck_id }, error: null };
}

function changeDeck(name: string, request: { deck_id: string }, change: Partial<Deck>) {
  deckWrites = [...deckWrites, { name, request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  if (!decks.some((deck) => deck.deck_id === request.deck_id)) {
    return deckNotFound;
  }
  const time = nextDeckTime();
  decks = decks.map((deck) => (deck.deck_id === request.deck_id ? { ...deck, ...change, last_used_at: time } : deck));
  return { data: null, error: null };
}

function deleteDeck(request: DeleteDeckRequest) {
  deckWrites = [...deckWrites, { name: 'delete_deck', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  if (!decks.some((deck) => deck.deck_id === request.deck_id)) {
    return deckNotFound;
  }
  deleteDeckOnTheServer(request.deck_id);
  return { data: null, error: null };
}

const copyNotFree = {
  data: null,
  error: { code: 'copy_not_free', message: 'Only a free copy can go into a deck.', details: 'copy_id' },
};

const copyProtected = {
  data: null,
  error: { code: 'copy_protected', message: 'copy_id is a protected copy.', details: 'copy_id' },
};

function deckCardOf(details: CopyDetails, addedAt: string): DeckCard {
  const { copy_id, printing_id, name, set, collector_number, rarity, image_uris, finish, condition, language, price, type_line } = details;
  return {
    copy_id,
    printing_id,
    name,
    set,
    collector_number,
    rarity,
    image_uris,
    finish,
    condition,
    language,
    protected: false,
    price,
    role: 'main',
    commander_at: null,
    added_at: addedAt,
    type_line,
    mana_value: 0,
    colors: [],
    planned_out: false,
  };
}

function addDeckCard(request: AddDeckCardRequest) {
  deckWrites = [...deckWrites, { name: 'add_deck_card', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const deck = decks.find((candidate) => candidate.deck_id === request.deck_id);
  if (!deck) {
    return deckNotFound;
  }
  const details = ownedCopyDetails(request.copy_id);
  if (!details) {
    return copyNotFound;
  }
  if (!details.free) {
    return copyNotFree;
  }
  if (details.protected && !request.unprotect) {
    return copyProtected;
  }
  const time = nextDeckTime();
  const changed: Deck = {
    ...deck,
    cards: [...deck.cards, deckCardOf(details, time)],
    card_count: deck.card_count + 1,
    revision: deck.revision + 1,
    last_used_at: time,
  };
  saveDeck(changed);
  copyDetails.set(request.copy_id, {
    ...details,
    protected: false,
    free: false,
    deck: {
      deck_id: deck.deck_id,
      name: deck.name,
      role: 'main',
      commander_art_crop_uri: deck.commanders[0]?.art_crop_uri ?? null,
      commander_count: deck.commanders.length,
    },
  });
  collectionCopies = collectionCopies.map((copy) =>
    copy.copy_id === request.copy_id ? { ...copy, protected: false, deck: { deck_id: deck.deck_id, name: deck.name } } : copy,
  );
  return { data: { deck_id: deck.deck_id, revision: changed.revision }, error: null };
}

function planPage<Item>(items: Item[], { cursor, limit = 20 }: { cursor?: string | null; limit?: number }) {
  const offset = cursor ? Number(cursor) : 0;
  const end = offset + limit;
  return { data: { items: items.slice(offset, end), next_cursor: end < items.length ? String(end) : null }, error: null };
}

function plannedSwapList(query: PlannedSwapsQuery) {
  plannedSwapQueriesSent = [...plannedSwapQueriesSent, query];
  if (failingNeedsYouReads > 0) {
    failingNeedsYouReads -= 1;
    return { data: null, error: networkFailure };
  }
  const direction = query.order === 'oldest_first' ? 1 : -1;
  const items = plannedSwaps
    .filter((swap) => (!query.status || swap.status === query.status) && (!query.deck_id || swap.deck_id === query.deck_id))
    .toSorted((a, b) => direction * a.created_at.localeCompare(b.created_at));
  return planPage(items, query);
}

function buylistList(query: BuylistQuery) {
  buylistQueriesSent = [...buylistQueriesSent, query];
  if (failingNeedsYouReads > 0) {
    failingNeedsYouReads -= 1;
    return { data: null, error: networkFailure };
  }
  const direction = query.order === 'oldest_first' ? 1 : -1;
  const items = buylistCards
    .filter((card) => (!query.status || card.status === query.status) && (!query.deck_id || card.deck_id === query.deck_id))
    .toSorted((a, b) => direction * a.created_at.localeCompare(b.created_at));
  return planPage(items, query);
}

function buylistCardToChange(buylistCardId: string, changeable: BuylistCard['status'][]) {
  const card = buylistCards.find((candidate) => candidate.buylist_card_id === buylistCardId);
  if (!card) {
    return { error: { code: 'not_found', message: 'buylist_card_id is not one of your buylist cards.', details: 'buylist_card_id' } };
  }
  if (!changeable.includes(card.status)) {
    return {
      error: { code: 'not_open', message: `The buylist card is ${card.status}. Only an open buylist card can change.`, details: 'buylist_card_id' },
    };
  }
  return { card };
}

function freeCopyList(query: FreeCopiesQuery) {
  if (failingFreeCopyReads > 0) {
    failingFreeCopyReads -= 1;
    return { data: null, error: networkFailure };
  }
  return { data: { items: freeCopies.get(query.oracle_id) ?? [] }, error: null };
}

function markBuylistCardBought(request: MarkBuylistCardBoughtRequest) {
  deckWrites = [...deckWrites, { name: 'mark_buylist_card_bought', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const { card, error } = buylistCardToChange(request.buylist_card_id, ['open']);
  if (!card) {
    return { data: null, error };
  }
  const copy = freeCopies.get(card.incoming.oracle_id)?.find((candidate) => candidate.copy_id === request.copy_id);
  if (!copy) {
    return { data: null, error: { code: 'copy_not_free', message: 'Only a free copy can go into a deck.', details: 'copy_id' } };
  }
  if (copy.protected && !request.unprotect) {
    return { data: null, error: { code: 'copy_protected', message: 'copy_id is a protected copy.', details: 'copy_id' } };
  }
  freeCopies.set(
    card.incoming.oracle_id,
    freeCopies.get(card.incoming.oracle_id)!.filter((candidate) => candidate.copy_id !== copy.copy_id),
  );
  changeBuylistCardElsewhere(card.buylist_card_id, 'bought');
  const deck = decks.find((candidate) => candidate.deck_id === card.deck_id);
  if (deck) {
    saveDeck({ ...deck, revision: deck.revision + 1, last_used_at: nextDeckTime() });
  }
  return { data: { deck_id: card.deck_id, revision: (deck?.revision ?? 0) + 1 }, error: null };
}

function closeBuylistCard(request: CloseBuylistCardRequest) {
  deckWrites = [...deckWrites, { name: 'close_buylist_card', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const { card, error } = buylistCardToChange(request.buylist_card_id, ['open', 'closed']);
  if (!card) {
    return { data: null, error };
  }
  const changed = card.status === 'open';
  changeBuylistCardElsewhere(card.buylist_card_id, 'closed');
  return { data: { id: card.buylist_card_id, changed }, error: null };
}

function plannedSwapToChange(plannedSwapId: string, changeable: PlannedSwap['status'][]) {
  const swap = plannedSwaps.find((candidate) => candidate.planned_swap_id === plannedSwapId);
  if (!swap) {
    return { error: { code: 'not_found', message: 'planned_swap_id is not one of your planned swaps.', details: 'planned_swap_id' } };
  }
  if (!changeable.includes(swap.status)) {
    return {
      error: { code: 'not_open', message: `The planned swap is ${swap.status}. Only an open planned swap can change.`, details: 'planned_swap_id' },
    };
  }
  return { swap };
}

function swapInPlannedSwap(request: SwapInPlannedSwapRequest) {
  deckWrites = [...deckWrites, { name: 'swap_in_planned_swap', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const { swap, error } = plannedSwapToChange(request.planned_swap_id, ['open']);
  if (!swap) {
    return { data: null, error };
  }
  changePlannedSwapElsewhere(swap.planned_swap_id, 'swapped_in');
  const deck = decks.find((candidate) => candidate.deck_id === swap.deck_id);
  if (deck) {
    saveDeck({ ...deck, revision: deck.revision + 1, last_used_at: nextDeckTime() });
  }
  return { data: { deck_id: swap.deck_id, revision: (deck?.revision ?? 0) + 1 }, error: null };
}

function swapInPlannedSwaps({ deck_id, planned_swap_ids }: SwapInPlannedSwapsRequest) {
  deckWrites = [...deckWrites, { name: 'swap_in_planned_swaps', request: { deck_id, planned_swap_ids } }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  for (const [index, plannedSwapId] of planned_swap_ids.entries()) {
    const { error } = plannedSwapToChange(plannedSwapId, ['open']);
    if (error) {
      return { data: null, error: { ...error, details: `planned_swap_ids[${index}]` } };
    }
  }
  const thirdCommander = planned_swap_ids.findIndex((plannedSwapId) => thirdCommanderSwaps.has(plannedSwapId));
  if (thirdCommander >= 0) {
    return {
      data: null,
      error: { code: 'commander_limit', message: 'A deck has at most two commanders.', details: `planned_swap_ids[${thirdCommander}]` },
    };
  }
  for (const plannedSwapId of planned_swap_ids) {
    changePlannedSwapElsewhere(plannedSwapId, 'swapped_in');
  }
  const deck = decks.find((candidate) => candidate.deck_id === deck_id);
  const revision = (deck?.revision ?? 0) + planned_swap_ids.length;
  if (deck) {
    saveDeck({ ...deck, revision, last_used_at: nextDeckTime() });
  }
  return { data: { deck_id, revision, swapped_in: planned_swap_ids, closed: [] }, error: null };
}

function closePlannedSwap(request: ClosePlannedSwapRequest) {
  deckWrites = [...deckWrites, { name: 'close_planned_swap', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const { swap, error } = plannedSwapToChange(request.planned_swap_id, ['open', 'closed']);
  if (!swap) {
    return { data: null, error };
  }
  const changed = swap.status === 'open';
  changePlannedSwapElsewhere(swap.planned_swap_id, 'closed');
  return { data: { id: swap.planned_swap_id, changed }, error: null };
}

function setDeckCommander(request: SetDeckCommanderRequest) {
  deckWrites = [...deckWrites, { name: 'set_deck_commander', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const deck = deckOfCopy(request.copy_id);
  if (!deck) {
    return copyNotFound;
  }
  const time = nextDeckTime();
  const cards = deck.cards.map((card) =>
    card.copy_id === request.copy_id
      ? { ...card, role: request.commander ? ('commander' as const) : ('main' as const), commander_at: request.commander ? time : null }
      : card,
  );
  const commanders = cards
    .filter((card) => card.commander_at !== null)
    .toSorted((a, b) => a.commander_at!.localeCompare(b.commander_at!))
    .map((card) => ({ copy_id: card.copy_id, name: card.name, art_crop_uri: copyDetails.get(card.copy_id)?.art_crop_uri ?? null }));
  const changed: Deck = { ...deck, cards, commanders, revision: deck.revision + 1, last_used_at: time };
  saveDeck(changed);
  return { data: { deck_id: deck.deck_id, revision: changed.revision }, error: null };
}

function saveDeck(changed: Deck) {
  decks = decks.map((candidate) => (candidate.deck_id === changed.deck_id ? judged(changed) : candidate));
  for (const card of changed.cards) {
    const details = copyDetails.get(card.copy_id);
    if (details?.deck) {
      copyDetails.set(card.copy_id, {
        ...details,
        deck: {
          ...details.deck,
          role: card.role,
          commander_art_crop_uri: changed.commanders[0]?.art_crop_uri ?? null,
          commander_count: changed.commanders.length,
        },
      });
    }
  }
}

const copyNotInDeck = {
  data: null,
  error: { code: 'copy_not_in_deck', message: 'copy_id is not in a deck.', details: 'copy_id' },
};

function deckOfCopy(copyId: string) {
  return decks.find((candidate) => candidate.cards.some((card) => card.copy_id === copyId));
}

function takeCopyOutOfItsDeck(copyId: string, deck: Deck) {
  const changed: Deck = {
    ...deck,
    cards: deck.cards.filter((card) => card.copy_id !== copyId),
    commanders: deck.commanders.filter((commander) => commander.copy_id !== copyId),
    card_count: deck.card_count - 1,
    revision: deck.revision + 1,
    last_used_at: nextDeckTime(),
  };
  saveDeck(changed);
  copyDetails.set(copyId, { ...copyDetails.get(copyId)!, free: true, deck: null });
  return changed;
}

function removeDeckCard(request: RemoveDeckCardRequest) {
  deckWrites = [...deckWrites, { name: 'remove_deck_card', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  if (!ownedCopyDetails(request.copy_id)) {
    return copyNotFound;
  }
  const deck = deckOfCopy(request.copy_id);
  if (!deck) {
    return copyNotInDeck;
  }
  const changed = takeCopyOutOfItsDeck(request.copy_id, deck);
  return { data: { deck_id: deck.deck_id, revision: changed.revision }, error: null };
}

function changeBasicLand(request: ChangeBasicLandRequest) {
  deckWrites = [...deckWrites, { name: 'change_basic_land', request }];
  if (failedDeckWrite()) {
    return { data: null, error: networkFailure };
  }
  const deck = decks.find((candidate) => candidate.deck_id === request.deck_id);
  if (!deck) {
    return deckNotFound;
  }
  const basicLands = deck.basic_lands.map((land) => (land.oracle_id === request.oracle_id ? { ...land, count: land.count + request.by } : land));
  if (basicLands.some((land) => land.count < 0 || land.count > 99)) {
    return { data: null, error: { code: 'invalid_argument', message: 'by would make too many of this basic land card.', details: 'by' } };
  }
  const changed: Deck = {
    ...deck,
    basic_lands: basicLands,
    card_count: deck.card_count + request.by,
    revision: deck.revision + 1,
    last_used_at: nextDeckTime(),
  };
  saveDeck(changed);
  return { data: { deck_id: deck.deck_id, revision: changed.revision }, error: null };
}

function basicLandCardList(): { data: BasicLandCardList; error: null } {
  return { data: { items: basicLandsOf().map(({ oracle_id, name, image_uris }) => ({ oracle_id: oracle_id!, name, image_uris })) }, error: null };
}

function deleteCopy({ copy_id, move_planned_swap }: DeleteCopyRequest) {
  if (failingCopyDeletes > 0) {
    failingCopyDeletes -= 1;
    return { data: null, error: networkFailure };
  }
  if (!collectionCopies.some((copy) => copy.copy_id === copy_id)) {
    return copyNotFound;
  }
  const heldFor = copyDetails.get(copy_id)?.held_for;
  if (heldFor && !move_planned_swap) {
    const message = `This copy is held by the planned swap for ${heldFor.name}. Send move_planned_swap: true to move that planned swap to the buylist and delete the copy.`;
    return { data: null, error: { code: 'copy_held', message, details: 'move_planned_swap' } };
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
      deck: null,
      held_for: null,
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

const aiClientsUnreachable = new AuthApiError('Network request failed', 0, undefined);

const oauthServer = {
  async listGrants() {
    if (failingAiClientReads > 0) {
      failingAiClientReads -= 1;
      return { data: null, error: aiClientsUnreachable };
    }
    return { data: session ? aiClients : [], error: null };
  },
  async revokeGrant({ clientId }: { clientId: string }) {
    await heldAiClientRevokes;
    if (failingAiClientRevokes > 0) {
      failingAiClientRevokes -= 1;
      return { data: null, error: aiClientsUnreachable };
    }
    aiClientRevokes.push(clientId);
    aiClients = aiClients.filter((aiClient) => aiClient.client.id !== clientId);
    return { data: {}, error: null };
  },
};

export const fakeSupabase = {
  from: cardCatalogTable,
  async rpc(
    name: string,
    args?:
      | { query: CollectionQuery }
      | { query: CopyQuery }
      | { query: DeckQuery }
      | { query: DeckChangesQuery }
      | { query: RevertPreviewQuery }
      | { query: AddDeckCardPreviewQuery }
      | { query: PlannedSwapsQuery }
      | { query: BuylistQuery }
      | { query: FreeCopiesQuery }
      | { query: Record<string, never> }
      | { query: CurrentPricesQuery }
      | { query: SetQuery }
      | { query: { text: string; limit: number } }
      | { batch: ScanBatch }
      | {
          request:
            | DeleteCopyRequest
            | CopyProtectedRequest
            | CreateUserTagRequest
            | CopyUserTagRequest
            | RenameUserTagRequest
            | DeleteUserTagRequest
            | CreateDeckRequest
            | MarkDeckUsedRequest
            | RenameDeckRequest
            | SetDeckPriorityRequest
            | DeleteDeckRequest
            | AddDeckCardRequest
            | SetDeckCommanderRequest
            | ChangeBasicLandRequest
            | RemoveDeckCardRequest
            | RevertDeckChangesRequest
            | SwapInPlannedSwapRequest
            | ClosePlannedSwapRequest
            | MarkBuylistCardBoughtRequest
            | CloseBuylistCardRequest;
        },
  ) {
    if (name === 'list_decks') {
      await heldDeckListReads;
      return deckList();
    }
    if (name === 'get_deck' && args && 'query' in args) {
      await heldDeckReads;
      return deckRead(args.query as DeckQuery);
    }
    if (name === 'list_deck_changes' && args && 'query' in args) {
      return deckChangeList(args.query as DeckChangesQuery);
    }
    if (name === 'preview_add_deck_card' && args && 'query' in args) {
      return addDeckCardPreviewRead(args.query as AddDeckCardPreviewQuery);
    }
    if (name === 'preview_revert' && args && 'query' in args) {
      return revertPreviewRead(args.query as RevertPreviewQuery);
    }
    if (name === 'revert_deck_changes' && args && 'request' in args) {
      return revertDeckChanges(args.request as RevertDeckChangesRequest);
    }
    if (name === 'create_deck' && args && 'request' in args) {
      return createDeck(args.request as CreateDeckRequest);
    }
    if (name === 'mark_deck_used' && args && 'request' in args) {
      return changeDeck(name, args.request as MarkDeckUsedRequest, {});
    }
    if (name === 'rename_deck' && args && 'request' in args) {
      const request = args.request as RenameDeckRequest;
      return changeDeck(name, request, { name: request.name.trim() });
    }
    if (name === 'set_deck_priority' && args && 'request' in args) {
      const request = args.request as SetDeckPriorityRequest;
      return changeDeck(name, request, { priority: request.priority });
    }
    if (name === 'delete_deck' && args && 'request' in args) {
      return deleteDeck(args.request as DeleteDeckRequest);
    }
    if (name === 'add_deck_card' && args && 'request' in args) {
      return addDeckCard(args.request as AddDeckCardRequest);
    }
    if (name === 'set_deck_commander' && args && 'request' in args) {
      return setDeckCommander(args.request as SetDeckCommanderRequest);
    }
    if (name === 'change_basic_land' && args && 'request' in args) {
      return changeBasicLand(args.request as ChangeBasicLandRequest);
    }
    if (name === 'list_sets') {
      return setList();
    }
    if (name === 'get_set' && args && 'query' in args) {
      return setPageRead(args.query as SetQuery);
    }
    if (name === 'list_basic_land_cards') {
      return basicLandCardList();
    }
    if (name === 'remove_deck_card' && args && 'request' in args) {
      return removeDeckCard(args.request as RemoveDeckCardRequest);
    }
    if (name === 'get_needs_you_counts') {
      return needsYouCounts();
    }
    if (name === 'list_planned_swaps' && args && 'query' in args) {
      await heldNeedsYouReads;
      return plannedSwapList(args.query as PlannedSwapsQuery);
    }
    if (name === 'swap_in_planned_swap' && args && 'request' in args) {
      return swapInPlannedSwap(args.request as SwapInPlannedSwapRequest);
    }
    if (name === 'swap_in_planned_swaps' && args && 'request' in args) {
      return swapInPlannedSwaps(args.request as SwapInPlannedSwapsRequest);
    }
    if (name === 'close_planned_swap' && args && 'request' in args) {
      return closePlannedSwap(args.request as ClosePlannedSwapRequest);
    }
    if (name === 'list_buylist' && args && 'query' in args) {
      await heldNeedsYouReads;
      return buylistList(args.query as BuylistQuery);
    }
    if (name === 'mark_buylist_card_bought' && args && 'request' in args) {
      return markBuylistCardBought(args.request as MarkBuylistCardBoughtRequest);
    }
    if (name === 'close_buylist_card' && args && 'request' in args) {
      return closeBuylistCard(args.request as CloseBuylistCardRequest);
    }
    if (name === 'list_free_copies' && args && 'query' in args) {
      return freeCopyList(args.query as FreeCopiesQuery);
    }
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
    if (name === 'get_collection_total' && args && 'query' in args) {
      return collectionTotalRead(args.query as object);
    }
    if (name === 'get_current_prices' && args && 'query' in args) {
      return currentPricesRead(args.query as CurrentPricesQuery);
    }
    if (name === 'list_exchange_rates') {
      return exchangeRateList();
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
    oauth: oauthServer,
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
      if (!testUserSeeded || email !== testUser.email || password !== testUserPassword) {
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

export function testUserHasPassword(password: string) {
  testUserPassword = password;
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

export function ownDecks(
  seeds: (Pick<Deck, 'name' | 'priority' | 'card_count'> & Partial<Pick<Deck, 'commanders' | 'cards' | 'basic_lands' | 'evaluation'>>)[],
) {
  decks = seeds.map(({ evaluation, ...seed }, index) => {
    const time = nextDeckTime();
    const deck = judged({
      deck_id: `deck-${index + 1}`,
      commanders: [],
      last_used_at: time,
      revision: 0,
      created_at: time,
      cards: [],
      basic_lands: basicLandsOf(),
      ...seed,
    });
    return evaluation === undefined ? deck : { ...deck, evaluation };
  });
}

export function ownDeckOfCopies(name: string, copies: CopyDetails[]) {
  ownDecks([{ name, priority: 'medium', card_count: copies.length, cards: copies.map((copy) => deckCardOf(copy, nextDeckTime())) }]);
  ownCopies(copies.map((copy) => ({ ...copy, free: false, deck: { deck_id: 'deck-1', name, role: 'main', commander_art_crop_uri: null, commander_count: 0 } })));
}

export function ownDeckChanges(deckId: string, changes: DeckChange[]) {
  deckChanges = new Map(deckChanges).set(deckId, changes);
}

export function failDeckChangeReads(count: number) {
  failingDeckChangeReads = count;
}

export function ownRevertPreview(deckChangeId: string, preview: Omit<RevertPreview, 'revision'>) {
  revertPreviews = new Map(revertPreviews).set(deckChangeId, preview);
}

export function ownAddPreviewEffects(effects: Record<string, DeckChangeEffect>) {
  addPreviewEffects = new Map(Object.entries(effects));
}

export function addPreviewQueriesSent() {
  return addPreviewQueries;
}

export function failAddPreviews(count: number) {
  failingAddPreviews = count;
}

export function holdAddPreviews() {
  let finish = () => {};
  heldAddPreviews = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldAddPreviews = null;
      await act(async () => finish());
    },
  };
}

export function changeDeckElsewhere(deckId: string, change: DeckChange) {
  const deck = decks.find((candidate) => candidate.deck_id === deckId)!;
  saveDeck({ ...deck, revision: change.revision });
  ownDeckChanges(deckId, [change, ...(deckChanges.get(deckId) ?? [])]);
}

export function holdCopyElsewhere(copyId: string, heldFor: CopyHeldFor) {
  copyDetails.set(copyId, { ...copyDetails.get(copyId)!, free: false, held_for: heldFor });
  collectionCopies = collectionCopies.map((copy) => (copy.copy_id === copyId ? { ...copy, held_for: heldFor } : copy));
}

export function allocateCopyElsewhere(copyId: string) {
  copyDetails.set(copyId, { ...copyDetails.get(copyId)!, free: false });
}

export function removeDeckCardOnTheServer(copyId: string) {
  takeCopyOutOfItsDeck(copyId, deckOfCopy(copyId)!);
}

export function decksOnTheServer() {
  return decks;
}

export function deleteDeckOnTheServer(deckId: string) {
  decks = decks.filter((deck) => deck.deck_id !== deckId);
}

export function ownPlannedSwaps(swaps: PlannedSwap[]) {
  plannedSwaps = swaps;
}

export function changePlannedSwapElsewhere(plannedSwapId: string, status: PlannedSwap['status']) {
  plannedSwaps = plannedSwaps.map((swap) => (swap.planned_swap_id === plannedSwapId ? { ...swap, status, effect: null } : swap));
}

export function refuseAsThirdCommander(plannedSwapId: string) {
  thirdCommanderSwaps.add(plannedSwapId);
}

export function plannedSwapQueries() {
  return plannedSwapQueriesSent;
}

export function failNeedsYouReads(count: number) {
  failingNeedsYouReads = count;
}

export function ownBuylistCards(cards: BuylistCard[]) {
  buylistCards = cards;
}

export function changeBuylistCardElsewhere(buylistCardId: string, status: BuylistCard['status']) {
  buylistCards = buylistCards.map((card) => (card.buylist_card_id === buylistCardId ? { ...card, status, effect: null } : card));
}

export function buylistQueries() {
  return buylistQueriesSent;
}

export function ownFreeCopies(oracleId: string, copies: FreeCopy[]) {
  freeCopies.set(oracleId, copies);
}

export function failFreeCopyReads(count: number) {
  failingFreeCopyReads = count;
}

export function deckWritesSent() {
  return deckWrites;
}

export function failDeckReads(count: number) {
  failingDeckReads = count;
}

export function failDeckWrites(count: number) {
  failingDeckWrites = count;
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

export function offerSets(rows: SetRow[]) {
  sets = rows;
}

export function setReadCount() {
  return setReads;
}

export function failSetReads(count: number) {
  failingSetReads = count;
}

export function holdSetReads() {
  let finish = () => {};
  heldSetReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldSetReads = null;
      await act(async () => finish());
    },
  };
}

export function offerSetPage(set: SetDetails) {
  setPages = new Map(setPages).set(set.code, set);
}

export function setPageReadsSent() {
  return setPageReads;
}

export function failSetPageReads(count: number) {
  failingSetPageReads = count;
}

export function holdSetPageReads() {
  let finish = () => {};
  heldSetPageReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldSetPageReads = null;
      await act(async () => finish());
    },
  };
}

export function ownCollectionTotal(total: CollectionTotal) {
  collectionTotal = total;
}

export function priceReadsSent() {
  return priceReads;
}

export function offerCurrentPrices(rows: CurrentPriceRow[]) {
  currentPrices = new Map([...(currentPrices ?? []), ...rows.map((row) => [currentPriceKey(row), row.price] as const)]);
}

export function currentPriceReadsSent() {
  return currentPriceReads;
}

export function failCurrentPriceReads(count: number) {
  failingCurrentPriceReads = count;
}

export function holdCurrentPriceReads() {
  let finish = () => {};
  heldCurrentPriceReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldCurrentPriceReads = null;
      await act(async () => finish());
    },
  };
}

export function offerExchangeRates(currencies: string[], rateDate = testRateDate) {
  exchangeRates = exchangeRatesOf(currencies, rateDate);
}

export function exchangeRateReadCount() {
  return exchangeRateReads;
}

export function failExchangeRateReads(count: number) {
  failingExchangeRateReads = count;
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

export function expirePageCursors() {
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

export function holdDeckReads() {
  let finish = () => {};
  heldDeckReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldDeckReads = null;
      await act(async () => finish());
    },
  };
}

export function holdDeckListReads() {
  let finish = () => {};
  heldDeckListReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldDeckListReads = null;
      await act(async () => finish());
    },
  };
}

export function holdNeedsYouReads() {
  let finish = () => {};
  heldNeedsYouReads = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldNeedsYouReads = null;
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

export function allowAiClients(seeds: { name: string; allowedAt: string }[]) {
  aiClients = seeds.map(({ name, allowedAt }, index) => ({
    client: { id: `ai-client-${index + 1}`, name, uri: '', logo_uri: '' },
    scopes: ['openid', 'email', 'profile'],
    granted_at: allowedAt,
  }));
}

export function failAiClientReads(count: number) {
  failingAiClientReads = count;
}

export function aiClientsRevokedOnTheServer() {
  return aiClientRevokes;
}

export function failAiClientRevokes(count: number) {
  failingAiClientRevokes = count;
}

export function holdAiClientRevokes() {
  let finish = () => {};
  heldAiClientRevokes = new Promise((resolve) => {
    finish = resolve;
  });
  return {
    finish: async () => {
      heldAiClientRevokes = null;
      await act(async () => finish());
    },
  };
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
  decks = [];
  deckClock = 0;
  deckWrites = [];
  failingDeckReads = 0;
  failingDeckWrites = 0;
  deckChanges = new Map();
  failingDeckChangeReads = 0;
  revertPreviews = new Map();
  addPreviewEffects = new Map();
  addPreviewQueries = [];
  failingAddPreviews = 0;
  heldAddPreviews = null;
  plannedSwaps = [];
  plannedSwapQueriesSent = [];
  thirdCommanderSwaps = new Set();
  failingNeedsYouReads = 0;
  buylistCards = [];
  buylistQueriesSent = [];
  freeCopies = new Map();
  failingFreeCopyReads = 0;
  collectionTotal = emptyCollectionTotal;
  sets = [];
  setReads = 0;
  failingSetReads = 0;
  heldSetReads = null;
  setPages = new Map();
  setPageReads = [];
  failingSetPageReads = 0;
  heldSetPageReads = null;
  priceReads = [];
  exchangeRates = exchangeRatesOf(frankfurterCurrencies);
  exchangeRateReads = 0;
  failingExchangeRateReads = 0;
  failingCollectionReads = 0;
  collectionSearches = [];
  collectionSearchAnswer = null;
  cursorGeneration = 0;
  scanBatchesSent = [];
  addedCopies = new Map();
  failingScanBatch = null;
  heldScanBatch = null;
  heldCollectionReads = null;
  heldDeckReads = null;
  heldDeckListReads = null;
  heldNeedsYouReads = null;
  galleryObjects = new Map();
  offlineGalleryReads = 0;
  currentPrices = null;
  currentPriceReads = [];
  failingCurrentPriceReads = 0;
  heldCurrentPriceReads = null;
  aiClients = [];
  failingAiClientReads = 0;
  aiClientRevokes = [];
  failingAiClientRevokes = 0;
  heldAiClientRevokes = null;
  publishGallery(publishedGalleryVersion);
  nextSignInEmail = defaultEmail;
  nextSignInError = null;
  testUserSeeded = true;
  testUserPassword = testUser.password;
  listeners.clear();
  users.clear();
}
