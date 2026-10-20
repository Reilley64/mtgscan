import type { Database } from '@mtgscan/supabase/database.types';
import type { ErrorCodeOf, ReplyOf, RequestArguments, RequestOf } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import {
  AuthApiError,
  FunctionsFetchError,
  FunctionsHttpError,
  type AuthChangeEvent,
  type AuthError,
  type OAuthGrant,
  type Session,
  type User,
} from '@supabase/supabase-js';
import type {
  CollectionCopyRow,
  CollectionQuery,
  CollectionTotal,
  CopyDetails,
  CopyHeldFor,
  CurrentPrice,
  CurrentPriceRow,
  ScanBatchStack,
  UserTag,
} from '@mtgscan/supabase/collection';
import type { ExchangeRate } from '@mtgscan/supabase/converted-prices';
import type { Deck, DeckBasicLand, DeckCard, DeckChange, DeckChangeEffect, DeckCommander, DeckEvaluation, RevertPreview } from '@mtgscan/supabase/decks';
import type { PlannedSwap } from '@mtgscan/supabase/planned-swaps';
import type { BuylistCard, FreeCopy } from '@mtgscan/supabase/buylist';
import type { CardSet, SetDetails } from '@mtgscan/supabase/sets';
import type { SignInProvider } from '@mtgscan/supabase/sign-in-providers';
import { testUser } from '@mtgscan/supabase/test-user';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

import { cardImageUri, cardSets, galleryPrintings, oracleTags, setIconUri } from './card-printings';
import { appleIdTokenNonce } from './fake-apple';
import { fileExists } from './fake-file-system';
import { callsSent, controlled, fail, Refused, requestsSent, resetControls, takeRefusal, type ArgumentKey, type Contract, type FunctionName } from './fake-supabase-controls';

const unreachable = Symbol('unreachable');

type Handler<Name extends FunctionName> = (
  ...[request]: RequestArguments<Contract<Name>>
) => ReplyOf<Contract<Name>> | Refused<ErrorCodeOf<Contract<Name>>> | typeof unreachable;

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

type Account = { provider: SignInProvider | 'email'; email: string };

type Membership = Pick<DeckCard, 'role' | 'commander_at' | 'added_at'> & { deck_id: string };

type CopyRecord = Omit<CopyDetails, 'deck' | 'free' | 'user_tags' | 'held_for'> &
  Pick<DeckCard, 'mana_value' | 'colors'> & { oracle_id: string | null; membership: Membership | null };

type NeedsYouItem = PlannedSwap | BuylistCard;

type DeckRecord = Omit<Deck, 'card_count' | 'commanders' | 'cards'>;

type UserTagRecord = UserTag & { copy_ids: string[] };

type TrainingCropUpload = { copyId: string; crop: Database['public']['Tables']['training_crops']['Row'] };

type CollectionSearchAnswer = { copies: CollectionCopyRow[]; basicLands?: string[] } | { refusedField: string };

const defaultEmail = 'player@example.com';
const rulesDataAt = '2026-10-12T06:00:00.000Z';
const testRateDate = '2026-10-12';
const wholeUnitCurrencies = ['ISK', 'JPY', 'KRW'];
const testExchangeRates: Record<string, string> = { AUD: '1.5234', EUR: '0.93', HUF: '324.52', IDR: '17921', JPY: '151.37' };
const frankfurterCurrencies = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
];

export const publishedGalleryVersion = '20261012-cf1753';
export const galleryPartNames = ['base-gallery-1.zlib', 'base-gallery-2.zlib', 'base-printing-list-1.zlib'];

function emptyStore() {
  return {
    session: null as Session | null,
    users: new Map<string, User>(),
    nextSignInEmail: defaultEmail,
    nextSignInError: null as AuthError | null,
    testUserSeeded: true,
    testUserPassword: testUser.password,
    copies: [] as CopyRecord[],
    decks: [] as DeckRecord[],
    userTags: [] as UserTagRecord[],
    decksCreated: 0,
    userTagsCreated: 0,
    clock: 0,
    nextEvaluations: new Map<string, DeckEvaluation | null>(),
    deckChanges: new Map<string, DeckChange[]>(),
    revertPreviews: new Map<string, Omit<RevertPreview, 'revision'>>(),
    addPreviewEffects: new Map<string, DeckChangeEffect>(),
    plannedSwaps: [] as PlannedSwap[],
    buylistCards: [] as BuylistCard[],
    collectionTotal: {
      total: '0.00',
      currency: 'USD',
      priced_copies: 0,
      copies: 0,
      stale: false,
      prices_observed_at: null,
    } as CollectionTotal,
    collectionSearchAnswer: null as ((query: CollectionQuery) => CollectionSearchAnswer) | null,
    cursorGeneration: 0,
    additions: new Map<string, string>(),
    sets: [] as CardSet[],
    setPages: new Map<string, SetDetails>(),
    currentPrices: null as Map<string, CurrentPrice | null> | null,
    exchangeRates: exchangeRatesOf(frankfurterCurrencies),
    trainingCropUploads: [] as TrainingCropUpload[],
    trainingCropRefusals: [] as string[],
    trainingCropUploadsOff: new Set<string>(),
    galleryObjects: galleryObjectsOf(publishedGalleryVersion, galleryPartNames),
    aiClients: [] as OAuthGrant[],
    aiClientRevokes: [] as string[],
  };
}

let store = emptyStore();
const listeners = new Set<AuthListener>();

export function resetFakeSupabase() {
  store = emptyStore();
  resetControls();
  listeners.clear();
}

const issuers: Record<Account['provider'], string | undefined> = {
  apple: 'https://appleid.apple.com',
  google: 'https://accounts.google.com',
  email: undefined,
};

function userSignedIn({ provider, email }: Account): User {
  const user = store.users.get(email) ?? {
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
  store.users.set(email, signedInUser);
  return signedInUser;
}

function sessionFor(account: Account): Session {
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

function notify(event: AuthChangeEvent) {
  listeners.forEach((listener) => listener(event, store.session));
}

function signedInEmail() {
  return store.session!.user.email!;
}

function nextTime() {
  store.clock += 1;
  return new Date(Date.UTC(2026, 9, 15, 9, store.clock)).toISOString();
}

function exchangeRatesOf(currencies: string[], rateDate = testRateDate): ExchangeRate[] {
  return currencies.map((currency) => ({
    currency,
    rate: currency === 'USD' ? '1' : (testExchangeRates[currency] ?? '1.25'),
    rate_date: currency === 'USD' ? null : rateDate,
    minor_unit_digits: wholeUnitCurrencies.includes(currency) ? 0 : 2,
  }));
}

function galleryObjectsOf(version: string, partNames: string[], formatVersion = 2) {
  return new Map([
    ['published.json', JSON.stringify({ formatVersion, version, manifest: `${version}/manifest.json` })],
    [`${version}/manifest.json`, JSON.stringify({ formatVersion, version, parts: partNames.map((name) => ({ name })) })],
  ]);
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

function basicLandCardsNamed(names: string[]) {
  return basicLandsOf()
    .filter((land) => names.includes(land.name))
    .map(({ oracle_id, name, image_uris }) => ({ oracle_id: oracle_id!, name, image_uris }));
}

export function basicLandsOf(counts: Record<string, number> = {}): DeckBasicLand[] {
  return basicLandNames.map((name) => ({
    oracle_id: basicLandOracleId(name),
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${basicLandOracleId(name)}.jpg`],
    count: counts[name] ?? 0,
  }));
}

function copyRecord(copyId: string) {
  return store.copies.find((copy) => copy.copy_id === copyId);
}

function deckRecord(deckId: string) {
  return store.decks.find((deck) => deck.deck_id === deckId);
}

function deckOfCopy(copy: CopyRecord) {
  return copy.membership ? deckRecord(copy.membership.deck_id) : undefined;
}

function membersOf(deck: DeckRecord) {
  return store.copies.filter((copy) => copy.membership?.deck_id === deck.deck_id);
}

function commandersOf(deck: DeckRecord): DeckCommander[] {
  const commanders = membersOf(deck)
    .filter((copy) => copy.membership!.role === 'commander')
    .toSorted((a, b) => (a.membership!.commander_at ?? '').localeCompare(b.membership!.commander_at ?? ''))
    .map(({ copy_id, name, art_crop_uri }) => ({ copy_id, name, art_crop_uri }));
  return commanders;
}

function openNeedsYouItems() {
  return [...store.plannedSwaps, ...store.buylistCards].filter((item) => item.status === 'open');
}

function plannedOutCopyIds(deckId: string) {
  return new Set(
    store.plannedSwaps
      .filter((swap) => swap.status === 'open' && swap.deck_id === deckId)
      .flatMap((swap) => (swap.outgoing?.kind === 'copy' ? [swap.outgoing.copy_id] : [])),
  );
}

function deckCardOfRecord(copy: CopyRecord, plannedOut: boolean): DeckCard {
  const { copy_id, printing_id, name, set, collector_number, rarity, image_uris, finish, condition, language, price, type_line, mana_value, colors } = copy;
  const { role, commander_at, added_at } = copy.membership!;
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
    protected: copy.protected,
    price,
    role,
    commander_at,
    added_at,
    type_line,
    mana_value,
    colors,
    planned_out: plannedOut,
  };
}

function deckOf(deck: DeckRecord): Deck {
  const members = membersOf(deck);
  const plannedOut = plannedOutCopyIds(deck.deck_id);
  const basicLandCount = deck.basic_lands.reduce((sum, land) => sum + land.count, 0);
  return {
    ...deck,
    card_count: members.length + basicLandCount,
    commanders: commandersOf(deck),
    cards: members.map((copy) => deckCardOfRecord(copy, plannedOut.has(copy.copy_id))),
  };
}

function userTagsOn(copyId: string): UserTag[] {
  return store.userTags
    .filter((userTag) => userTag.copy_ids.includes(copyId))
    .toSorted(byName)
    .map(({ user_tag_id, name }) => ({ user_tag_id, name }));
}

function heldFor(copyId: string): CopyHeldFor | null {
  const swap = store.plannedSwaps.find(
    (candidate) => candidate.status === 'open' && candidate.incoming.kind === 'copy' && candidate.incoming.copy_id === copyId,
  );
  return swap ? { deck_id: swap.deck_id, name: swap.deck_name, commander_art_crop_uri: swap.commander_art_crop_uri } : null;
}

function copyDetailsOf({ membership, mana_value, colors, oracle_id, ...copy }: CopyRecord): CopyDetails {
  const deck = membership && deckRecord(membership.deck_id);
  const commanders = deck ? commandersOf(deck) : [];
  const held_for = heldFor(copy.copy_id);
  return {
    ...copy,
    held_for,
    free: !deck && !held_for,
    user_tags: userTagsOn(copy.copy_id),
    deck: deck
      ? {
          deck_id: deck.deck_id,
          name: deck.name,
          role: membership.role,
          commander_art_crop_uri: commanders[0]?.art_crop_uri ?? null,
          commander_count: commanders.length,
        }
      : null,
  };
}

export function copyRowOf(copy: CopyDetails): CollectionCopyRow {
  const { copy_id, printing_id, name, set, collector_number, rarity, image_uris, finish, condition, language, price, deck, held_for, added_at } = copy;
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
    protected: copy.protected,
    price,
    deck: deck && { deck_id: deck.deck_id, name: deck.name },
    held_for: held_for && { deck_id: held_for.deck_id, name: held_for.name },
    created_at: added_at,
  };
}

function binderRowOf(copy: CopyRecord) {
  return copyRowOf(copyDetailsOf(copy));
}

function byName(a: UserTag, b: UserTag) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function changedDeck(deck: DeckRecord, revisions = 1) {
  deck.revision += revisions;
  deck.last_used_at = nextTime();
  if (store.nextEvaluations.has(deck.deck_id)) {
    deck.evaluation = store.nextEvaluations.get(deck.deck_id)!;
    store.nextEvaluations.delete(deck.deck_id);
  }
  return { deck_id: deck.deck_id, revision: deck.revision };
}

function pageOf<Item>(items: Item[], offset: number, limit: number, cursorOf: (end: number) => string) {
  const end = offset + limit;
  return { items: items.slice(offset, end), next_cursor: end < items.length ? cursorOf(end) : null };
}

function generationPage<Item>(items: Item[], cursor: string | null | undefined, limit: number) {
  const [generation, offset] = cursor ? cursor.split(':').map(Number) : [store.cursorGeneration, 0];
  if (generation !== store.cursorGeneration) {
    return new Refused('invalid_cursor', 'The cursor has expired. Start the search again.', 'cursor');
  }
  return pageOf(items, offset!, limit, (end) => `${store.cursorGeneration}:${end}`);
}

function numberedPage<Item>(items: Item[], { cursor, limit = 20 }: { cursor?: string | null; limit?: number }) {
  return pageOf(items, cursor ? Number(cursor) : 0, limit, String);
}

function currentPriceKey({ printing_id, finish }: Pick<CurrentPriceRow, 'printing_id' | 'finish'>) {
  return `${printing_id}|${finish}`;
}

const notFound = {
  copy: new Refused('not_found', 'copy_id is not a copy in your collection.', 'copy_id'),
  deck: new Refused('not_found', 'deck_id is not one of your decks.', 'deck_id'),
  userTag: new Refused('not_found', 'user_tag_id is not one of your user tags.', 'user_tag_id'),
};

const needsYouNouns = { planned_swap_id: 'planned swap', buylist_card_id: 'buylist card' };

function needsYouIdOf(item: NeedsYouItem) {
  return 'planned_swap_id' in item ? item.planned_swap_id : item.buylist_card_id;
}

function needsYouPage<Item extends NeedsYouItem>(items: Item[], query: RequestOf<Contract<'list_planned_swaps' | 'list_buylist'>> = {}) {
  const direction = query.order === 'oldest_first' ? 1 : -1;
  const listed = items
    .filter((item) => (!query.status || item.status === query.status) && (!query.deck_id || item.deck_id === query.deck_id))
    .toSorted((a, b) => direction * a.created_at.localeCompare(b.created_at));
  return numberedPage(listed, query);
}

function needsYouItemToChange<Item extends NeedsYouItem>(items: Item[], field: keyof typeof needsYouNouns, id: string, changeable: Item['status'][]) {
  const noun = needsYouNouns[field];
  const item = items.find((candidate) => needsYouIdOf(candidate) === id);
  if (!item) {
    return new Refused('not_found', `${field} is not one of your ${noun}s.`, field);
  }
  if (!changeable.includes(item.status)) {
    return new Refused('not_open', `The ${noun} is ${item.status}. Only an open ${noun} can change.`, field);
  }
  return item;
}

function withNeedsYouStatus<Item extends NeedsYouItem>(items: Item[], id: string, status: Item['status']) {
  return items.map((item) => (needsYouIdOf(item) === id ? { ...item, status, effect: null } : item));
}

function takeCopy(copy: CopyRecord, deckId: string, role: Membership['role'], unprotect: boolean) {
  if (copy.protected && !unprotect) {
    return new Refused('protected_copy', 'copy_id is a protected copy. Send unprotect: true to unprotect it and put it in the deck.', 'copy_id');
  }
  copy.protected = false;
  copy.membership = { deck_id: deckId, role, commander_at: role === 'commander' ? nextTime() : null, added_at: nextTime() };
  return null;
}

function changeDeckRecord(deckId: string, change: Partial<DeckRecord>) {
  const deck = deckRecord(deckId);
  if (!deck) {
    return notFound.deck;
  }
  Object.assign(deck, change, { last_used_at: nextTime() });
  return null;
}

function addToCollection(copies: { copyId: string; stack: ScanBatchStack }[]) {
  const added = copies.map(({ copyId, stack }): CopyRecord => {
    const printing = galleryPrintings.find((candidate) => candidate.printingId === stack.card_printing_id)!;
    return {
      ...copyDefaults,
      copy_id: copyId,
      printing_id: printing.printingId,
      name: printing.name,
      set: printing.setCode,
      collector_number: printing.collectorNumber,
      image_uris: [cardImageUri(printing.printingId)],
      finish: stack.finish,
      condition: stack.condition,
      language: stack.language,
      added_at: new Date().toISOString(),
    };
  });
  store.copies = [...added, ...store.copies];
}

const handlers: { [Name in FunctionName]?: Handler<Name> } = {
  list_decks: () => ({
    items: store.decks
      .map(deckOf)
      .toSorted((a, b) => b.last_used_at.localeCompare(a.last_used_at) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map(({ created_at, cards, basic_lands, evaluation, ...row }) => ({
        ...row,
        evaluation: evaluation && {
          validity: evaluation.validity,
          validity_stale: evaluation.validity_stale,
          estimated_bracket: evaluation.estimated_bracket,
          bracket_stale: evaluation.bracket_stale,
        },
        needs_you_count: openNeedsYouItems().filter((item) => item.deck_id === row.deck_id).length,
      })),
  }),
  get_deck: ({ deck_id }) => {
    const deck = deckRecord(deck_id);
    return deck ? deckOf(deck) : notFound.deck;
  },
  list_deck_changes: ({ deck_id, cursor }) =>
    deckRecord(deck_id) ? generationPage(store.deckChanges.get(deck_id) ?? [], cursor, 20) : notFound.deck,
  preview_revert: ({ deck_id, deck_change_id }) => {
    const deck = deckRecord(deck_id);
    const preview = store.revertPreviews.get(deck_change_id);
    return deck && preview ? { ...preview, revision: deck.revision } : notFound.deck;
  },
  preview_add_deck_card: () => ({
    items: store.decks.map((deck) => ({ deck_id: deck.deck_id, effect: store.addPreviewEffects.get(deck.deck_id) ?? null })),
  }),
  list_sets: ({ text, finish_view, cursor, limit = 20 }) => {
    const wanted = text?.toLowerCase() ?? '';
    const listed = store.sets.filter(
      (set) =>
        set.completion[finish_view].size > 0 && (set.name.toLowerCase().includes(wanted) || set.code.toLowerCase().includes(wanted)),
    );
    return numberedPage(listed, { cursor, limit });
  },
  get_set: ({ code }) => store.setPages.get(code) ?? new Refused('not_found', 'code is not a released set in the card catalog.', 'code'),
  list_basic_land_cards: () => ({ items: basicLandCardsNamed(basicLandNames) }),
  get_needs_you_counts: () => {
    const items = openNeedsYouItems();
    const deckIds = [...new Set(items.map((item) => item.deck_id))];
    return {
      total: items.length,
      decks: deckIds.map((deckId) => ({ deck_id: deckId, count: items.filter((item) => item.deck_id === deckId).length })),
    };
  },
  list_planned_swaps: (query) => needsYouPage(store.plannedSwaps, query),
  list_buylist: (query) => needsYouPage(store.buylistCards, query),
  list_free_copies: ({ oracle_id }) => ({
    items: store.copies
      .filter((copy) => copy.oracle_id === oracle_id)
      .map(copyDetailsOf)
      .filter((copy) => copy.free)
      .map(copyRowOf)
      .map(({ deck, held_for, created_at, ...freeCopy }) => freeCopy),
  }),
  list_user_tags: () => ({
    items: store.userTags.toSorted(byName).map(({ user_tag_id, name, copy_ids }) => ({
      user_tag_id,
      name,
      copy_count: copy_ids.filter((copyId) => copyRecord(copyId)).length,
    })),
  }),
  search_collection: (query) => {
    const { rows, cursor, limit = 60, ...search } = query;
    if (rows !== 'copies') {
      throw new Error('The fake Supabase client searches the collection only for copy rows');
    }
    const answer = store.collectionSearchAnswer
      ? store.collectionSearchAnswer(search)
      : { copies: store.copies.map(binderRowOf), basicLands: store.copies.length > 0 ? basicLandNames : [] };
    if ('refusedField' in answer) {
      return new Refused('invalid_argument', `${answer.refusedField} is not known.`, answer.refusedField);
    }
    const { copies, basicLands = [] } = answer;
    const page = generationPage(copies, cursor, limit);
    if (page instanceof Refused) {
      return page;
    }
    return {
      ...page,
      total_count: cursor ? null : copies.length,
      basic_lands: cursor ? null : basicLandCardsNamed(basicLands),
      prices_observed_at: null,
      prices_stale: false,
      rules_data_as_of: rulesDataAt,
      rules_stale: false,
      search_id: 'search-1',
    };
  },
  search_oracle_tags: ({ text, limit }) => ({
    items: oracleTags
      .filter((tag) => tag.slug.includes(text.toLowerCase()))
      .slice(0, limit)
      .map((tag) => ({ ...tag, id: `oracle-tag-${tag.slug}`, aliases: [], description: null, parent_slugs: [], card_count: 0 })),
    rules_data_as_of: rulesDataAt,
    rules_stale: false,
  }),
  get_copy: ({ copy_id }) => {
    const copy = copyRecord(copy_id);
    return copy ? copyDetailsOf(copy) : notFound.copy;
  },
  get_collection_total: () => store.collectionTotal,
  get_current_prices: ({ items }) => {
    const known = store.currentPrices;
    if (!known) {
      return unreachable;
    }
    return { items: items.map((item) => ({ ...item, price: known.get(currentPriceKey(item)) ?? null })) };
  },
  list_exchange_rates: () => ({ items: store.exchangeRates }),
  get_training_crop_settings: () => ({ uploads_on: !store.trainingCropUploadsOff.has(signedInEmail()) }),
  set_training_crop_uploads: ({ on }) => {
    if (on) {
      store.trainingCropUploadsOff.delete(signedInEmail());
    } else {
      store.trainingCropUploadsOff.add(signedInEmail());
    }
    return { uploads_on: on };
  },
  create_deck: ({ name }) => {
    store.decksCreated += 1;
    const time = nextTime();
    const deck: DeckRecord = {
      deck_id: `deck-${store.decksCreated}`,
      name: name.trim(),
      priority: 'medium',
      last_used_at: time,
      revision: 0,
      created_at: time,
      basic_lands: basicLandsOf(),
      evaluation: null,
    };
    store.decks = [...store.decks, deck];
    return { deck_id: deck.deck_id };
  },
  mark_deck_used: ({ deck_id }) => changeDeckRecord(deck_id, {}),
  rename_deck: ({ deck_id, name }) => changeDeckRecord(deck_id, { name: name.trim() }),
  set_deck_priority: ({ deck_id, priority }) => changeDeckRecord(deck_id, { priority }),
  delete_deck: ({ deck_id }) => {
    if (!deckRecord(deck_id)) {
      return notFound.deck;
    }
    store.decks = store.decks.filter((deck) => deck.deck_id !== deck_id);
    return null;
  },
  add_deck_card: ({ deck_id, copy_id, unprotect }) => {
    const deck = deckRecord(deck_id);
    if (!deck) {
      return notFound.deck;
    }
    const copy = copyRecord(copy_id);
    if (!copy) {
      return notFound.copy;
    }
    return takeCopy(copy, deck_id, 'main', unprotect) ?? changedDeck(deck);
  },
  set_deck_commander: ({ copy_id, commander }) => {
    const copy = copyRecord(copy_id);
    const deck = copy && deckOfCopy(copy);
    if (!copy?.membership || !deck) {
      return notFound.copy;
    }
    const time = nextTime();
    copy.membership = { ...copy.membership, role: commander ? 'commander' : 'main', commander_at: commander ? time : null };
    return changedDeck(deck);
  },
  change_basic_land: ({ deck_id, oracle_id, by }) => {
    const deck = deckRecord(deck_id);
    if (!deck) {
      return notFound.deck;
    }
    deck.basic_lands = deck.basic_lands.map((land) => (land.oracle_id === oracle_id ? { ...land, count: land.count + by } : land));
    return changedDeck(deck);
  },
  remove_deck_card: ({ copy_id }) => {
    const copy = copyRecord(copy_id);
    if (!copy) {
      return notFound.copy;
    }
    const deck = deckOfCopy(copy);
    if (!deck) {
      return new Refused('copy_not_in_deck', 'copy_id is not in a deck.', 'copy_id');
    }
    copy.membership = null;
    return changedDeck(deck);
  },
  revert_deck_changes: ({ deck_id, deck_change_id }) => {
    const deck = deckRecord(deck_id);
    const changes = store.deckChanges.get(deck_id) ?? [];
    const reverted = changes.find((change) => change.deck_change_id === deck_change_id);
    if (!deck || !reverted) {
      return notFound.deck;
    }
    const answer = changedDeck(deck);
    const revert: DeckChange = {
      deck_change_id: `deck-change-${deck.revision}`,
      revision: deck.revision,
      kind: 'revert',
      changed_at: deck.last_used_at,
      reverted: false,
      reason: null,
      lines: store.revertPreviews.get(deck_change_id)!.lines,
    };
    store.deckChanges.set(deck_id, [
      revert,
      ...changes.map((change) => (change.revision >= reverted.revision ? { ...change, reverted: true } : change)),
    ]);
    return answer;
  },
  swap_in_planned_swap: ({ planned_swap_id }) => {
    const swap = needsYouItemToChange(store.plannedSwaps, 'planned_swap_id', planned_swap_id, ['open']);
    if (swap instanceof Refused) {
      return swap;
    }
    store.plannedSwaps = withNeedsYouStatus(store.plannedSwaps, planned_swap_id, 'swapped_in');
    return changedDeck(deckRecord(swap.deck_id)!);
  },
  swap_in_planned_swaps: ({ deck_id, planned_swap_ids }) => {
    for (const [index, plannedSwapId] of planned_swap_ids.entries()) {
      const swap = needsYouItemToChange(store.plannedSwaps, 'planned_swap_id', plannedSwapId, ['open']);
      if (swap instanceof Refused) {
        return new Refused(swap.code, swap.message, `planned_swap_ids[${index}]`);
      }
    }
    for (const plannedSwapId of planned_swap_ids) {
      store.plannedSwaps = withNeedsYouStatus(store.plannedSwaps, plannedSwapId, 'swapped_in');
    }
    return { ...changedDeck(deckRecord(deck_id)!, planned_swap_ids.length), swapped_in: planned_swap_ids, closed: [] };
  },
  close_planned_swap: ({ planned_swap_id }) => {
    const swap = needsYouItemToChange(store.plannedSwaps, 'planned_swap_id', planned_swap_id, ['open', 'closed']);
    if (swap instanceof Refused) {
      return swap;
    }
    store.plannedSwaps = withNeedsYouStatus(store.plannedSwaps, planned_swap_id, 'closed');
    return { id: planned_swap_id, changed: swap.status === 'open' };
  },
  mark_buylist_card_bought: ({ buylist_card_id, copy_id, unprotect }) => {
    const card = needsYouItemToChange(store.buylistCards, 'buylist_card_id', buylist_card_id, ['open']);
    if (card instanceof Refused) {
      return card;
    }
    const copy = copyRecord(copy_id);
    if (!copy) {
      return notFound.copy;
    }
    const refused = takeCopy(copy, card.deck_id, card.as_commander ? 'commander' : 'main', unprotect);
    if (refused) {
      return refused;
    }
    store.buylistCards = withNeedsYouStatus(store.buylistCards, buylist_card_id, 'bought');
    return changedDeck(deckRecord(card.deck_id)!);
  },
  close_buylist_card: ({ buylist_card_id }) => {
    const card = needsYouItemToChange(store.buylistCards, 'buylist_card_id', buylist_card_id, ['open', 'closed']);
    if (card instanceof Refused) {
      return card;
    }
    store.buylistCards = withNeedsYouStatus(store.buylistCards, buylist_card_id, 'closed');
    return { id: buylist_card_id, changed: card.status === 'open' };
  },
  create_user_tag: ({ name }) => {
    store.userTagsCreated += 1;
    const userTag = { user_tag_id: `user-tag-${store.userTagsCreated}`, name: name.trim() };
    store.userTags = [...store.userTags, { ...userTag, copy_ids: [] }];
    return userTag;
  },
  rename_user_tag: ({ user_tag_id, name }) => {
    const userTag = store.userTags.find((candidate) => candidate.user_tag_id === user_tag_id);
    if (!userTag) {
      return notFound.userTag;
    }
    userTag.name = name.trim();
    return { user_tag_id, name: userTag.name };
  },
  delete_user_tag: ({ user_tag_id }) => {
    if (!store.userTags.some((userTag) => userTag.user_tag_id === user_tag_id)) {
      return notFound.userTag;
    }
    store.userTags = store.userTags.filter((userTag) => userTag.user_tag_id !== user_tag_id);
    return null;
  },
  set_copy_user_tag: ({ copy_id, user_tag_id, tagged }) => {
    if (!copyRecord(copy_id)) {
      return notFound.copy;
    }
    const userTag = store.userTags.find((candidate) => candidate.user_tag_id === user_tag_id);
    if (!userTag) {
      return notFound.userTag;
    }
    const others = userTag.copy_ids.filter((copyId) => copyId !== copy_id);
    userTag.copy_ids = tagged ? [...others, copy_id] : others;
    return null;
  },
  delete_copy: ({ copy_id }) => {
    const copy = copyRecord(copy_id);
    if (!copy) {
      return notFound.copy;
    }
    store.copies = store.copies.filter((candidate) => candidate !== copy);
    return null;
  },
  set_copy_protected: (request) => {
    const copy = copyRecord(request.copy_id);
    if (!copy) {
      return notFound.copy;
    }
    copy.protected = request.protected;
    return request;
  },
  add_scan_batch: ({ items }) => {
    const copies = items.flatMap((stack) => stack.copy_ids.map((copyId) => ({ copyId, stack })));
    const newCopies = copies.filter(({ copyId }) => !store.additions.has(copyId));
    const additionId = newCopies.length > 0 ? `addition-${new Set(store.additions.values()).size + 1}` : null;
    const addedAt = additionId && new Date(Date.UTC(2026, 9, 13, 10, store.additions.size)).toISOString();
    if (additionId) {
      addToCollection(newCopies);
      newCopies.forEach(({ copyId }) => store.additions.set(copyId, additionId));
    }
    return {
      addition_id: additionId,
      added_at: addedAt,
      copy_count: newCopies.length,
      items: [],
      copies: copies.map(({ copyId }) => ({
        copy_id: copyId,
        addition_id: store.additions.get(copyId)!,
        replayed: store.additions.get(copyId) !== additionId,
      })),
    };
  },
};

const networkFailure = { code: '', message: 'TypeError: Network request failed', details: null, hint: '' };

function responseOf(answer: unknown) {
  if (answer === unreachable) {
    return { data: null, error: networkFailure };
  }
  if (answer instanceof Refused) {
    return { data: null, error: { code: answer.code, message: answer.message, details: answer.field, hint: '' } };
  }
  return { data: answer, error: null };
}

function answerOf<Name extends FunctionName>(name: Name, ...request: RequestArguments<Contract<Name>>) {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`The fake Supabase client has no ${name} function`);
  }
  return handler(...request);
}

export function changeElsewhere<Name extends FunctionName>(name: Name, ...request: RequestArguments<Contract<Name>>) {
  const answer = answerOf(name, ...request);
  if (answer instanceof Refused || answer === unreachable) {
    throw new Error(`The fake Supabase client could not change ${name} elsewhere`);
  }
}

const offline = { name: 'StorageUnknownError', message: 'Network request failed' };

function galleryBucket(bucket: string) {
  if (bucket !== 'gallery') {
    throw new Error(`The fake Supabase client has no ${bucket} bucket`);
  }
  return {
    download: (path: string) =>
      controlled(
        'gallery.download',
        path,
        () => {
          const text = store.session ? store.galleryObjects.get(path) : undefined;
          return text === undefined
            ? { data: null, error: { name: 'StorageApiError', message: 'Object not found' } }
            : { data: new Blob([text]), error: null };
        },
        { data: null, error: offline },
      ),
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
          limit: (count: number) => {
            const prefix = pattern.replace(/%$/, '');
            const sets = cardSets.filter((set) => set.code.startsWith(prefix.toLowerCase())).slice(0, count);
            return controlled('card_sets.lookup', prefix, () => ({ data: sets, error: null }), { data: null, error: networkFailure });
          },
        }),
      }),
    }),
  };
}

const edgeFunctions = {
  async invoke(name: string, { body }: { body: FormData }) {
    if (name !== 'training-crops') {
      throw new Error(`The fake Supabase client has no ${name} function`);
    }
    const [image] = body.getAll('image') as unknown as [{ uri: string }];
    if (!fileExists(image.uri)) {
      return new Promise<never>(() => {});
    }
    return controlled(
      'training-crops',
      body,
      () => {
        const copyId = String(body.getAll('copy_id')[0]);
        const refusal =
          store.trainingCropRefusals.shift() ??
          (store.session && store.trainingCropUploadsOff.has(signedInEmail()) ? 'uploads_off' : undefined) ??
          (copyRecord(copyId) ? undefined : 'unknown_copy');
        if (refusal) {
          const response = Response.json({ code: refusal, message: refusal, details: null }, { status: 400 });
          return { data: null, error: new FunctionsHttpError(response) };
        }
        store.trainingCropUploads = [...store.trainingCropUploads, { copyId, crop: JSON.parse(String(body.getAll('crop')[0])) }];
        return { data: null, error: null };
      },
      { data: null, error: new FunctionsFetchError(new TypeError('Network request failed')) },
    );
  },
};

const aiClientsUnreachable = { data: null, error: new AuthApiError('Network request failed', 0, undefined) };

const oauthServer = {
  listGrants: () =>
    controlled('oauth.listGrants', undefined, () => ({ data: store.session ? store.aiClients : [], error: null }), aiClientsUnreachable),
  revokeGrant: ({ clientId }: { clientId: string }) =>
    controlled(
      'oauth.revokeGrant',
      clientId,
      () => {
        store.aiClientRevokes = [...store.aiClientRevokes, clientId];
        store.aiClients = store.aiClients.filter((aiClient) => aiClient.client.id !== clientId);
        return { data: {}, error: null };
      },
      aiClientsUnreachable,
    ),
};

export const fakeSupabase = {
  from: cardCatalogTable,
  rpc<Name extends FunctionName>(name: Name, args: { [Key in ArgumentKey]?: unknown }) {
    const { argument } = databaseFunctions[name];
    const request = (argument === null ? [] : [args[argument]]) as RequestArguments<Contract<Name>>;
    return controlled(name, request[0], () => responseOf(takeRefusal(name) ?? answerOf(name, ...request)), { data: null, error: networkFailure });
  },
  storage: { from: galleryBucket },
  functions: edgeFunctions,
  auth: {
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      void Promise.resolve().then(() => listener('INITIAL_SESSION', store.session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async startAutoRefresh() {},
    async stopAutoRefresh() {},
    oauth: oauthServer,
    async signInWithIdToken({ provider, token, nonce }: { provider: SignInProvider; token: string; nonce?: string }) {
      if (!(await nonceMatches(provider, token, nonce))) {
        const error = new AuthApiError('Nonces mismatch', 400, 'bad_jwt');
        return { data: { session: null, user: null }, error };
      }
      if (store.nextSignInError) {
        const error = store.nextSignInError;
        store.nextSignInError = null;
        return { data: { session: null, user: null }, error };
      }
      store.session = sessionFor({ provider, email: store.nextSignInEmail });
      notify('SIGNED_IN');
      return { data: { session: store.session, user: store.session.user }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      if (!store.testUserSeeded || email !== testUser.email || password !== store.testUserPassword) {
        const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
        return { data: { session: null, user: null }, error };
      }
      store.session = sessionFor({ provider: 'email', email });
      notify('SIGNED_IN');
      return { data: { session: store.session, user: store.session.user }, error: null };
    },
    async signOut() {
      store.session = null;
      notify('SIGNED_OUT');
      return { error: null };
    },
  },
};

export function startSignedIn(account: Account = { provider: 'google', email: defaultEmail }) {
  store.session = sessionFor(account);
}

export function signInNextWithEmail(email: string) {
  store.nextSignInEmail = email;
}

export function failNextSignIn(error: AuthError) {
  store.nextSignInError = error;
}

export function testUserIsNotSeeded() {
  store.testUserSeeded = false;
}

export function testUserHasPassword(password: string) {
  store.testUserPassword = password;
}

const copyDefaults = {
  rarity: 'common',
  protected: false,
  price: null,
  oracle_id: null,
  art_crop_uri: null,
  purchase_day_price: null,
  type_line: '',
  faces: [],
  commander_legality: 'legal',
  mana_value: 0,
  colors: [],
  membership: null,
} satisfies Partial<CopyRecord>;

function seededCopy(copy: Pick<CopyRecord, 'copy_id'> & Partial<CopyRecord>): CopyRecord {
  return { ...copyDefaults, ...copyRecord(copy.copy_id), ...copy } as CopyRecord;
}

function seedCopy(copy: Pick<CopyRecord, 'copy_id'> & Partial<CopyRecord>) {
  const seeded = seededCopy(copy);
  store.copies = [...store.copies.filter((candidate) => candidate.copy_id !== copy.copy_id), seeded];
}

export function holdCopyElsewhere(copyId: string, heldFor: CopyHeldFor) {
  const { name, image_uris, type_line, set, collector_number, finish, condition, added_at } = copyRecord(copyId)!;
  const holdingSwap: PlannedSwap = {
    planned_swap_id: `planned-swap-holding-${copyId}`,
    deck_id: heldFor.deck_id,
    deck_name: heldFor.name,
    commander_art_crop_uri: heldFor.commander_art_crop_uri,
    incoming: { kind: 'copy', copy_id: copyId, name, image_uris, type_line, set, collector_number, finish, condition },
    outgoing: null,
    as_commander: false,
    reason: '',
    status: 'open',
    close_note: null,
    created_at: added_at,
    status_changed_at: added_at,
    effect: null,
  };
  store.plannedSwaps = [...store.plannedSwaps, holdingSwap];
}

export function ownCollectionCopies(rows: CollectionCopyRow[]) {
  store.copies = rows.map(({ deck, held_for, created_at, ...row }) =>
    seededCopy({
      ...row,
      added_at: created_at,
      ...(deck && { membership: { deck_id: deck.deck_id, role: 'main', commander_at: null, added_at: created_at } }),
    }),
  );
  for (const { copy_id, held_for } of rows) {
    if (held_for) {
      holdCopyElsewhere(copy_id, { ...held_for, commander_art_crop_uri: null });
    }
  }
}

export function ownCopies(copies: CopyDetails[]) {
  store.copies = copies.map(({ deck, free, user_tags, held_for, ...copy }) => {
    const membership = copyRecord(copy.copy_id)?.membership;
    return seededCopy({
      ...copy,
      ...(deck && {
        membership: {
          deck_id: deck.deck_id,
          role: deck.role,
          commander_at: membership?.commander_at ?? (deck.role === 'commander' ? copy.added_at : null),
          added_at: membership?.added_at ?? copy.added_at,
        },
      }),
    });
  });
  for (const { copy_id, held_for } of copies) {
    if (held_for) {
      holdCopyElsewhere(copy_id, held_for);
    }
  }
}

export function ownUserTags(seeds: { name: string; copyIds: string[] }[]) {
  store.userTags = seeds.map(({ name, copyIds }, index) => ({ user_tag_id: `user-tag-${index + 1}`, name, copy_ids: copyIds }));
  store.userTagsCreated = seeds.length;
}

type DeckSeed = Pick<Deck, 'name' | 'priority'> & Partial<Pick<Deck, 'commanders' | 'cards' | 'basic_lands' | 'evaluation'>>;

export function ownDecks(seeds: DeckSeed[]) {
  store.decks = seeds.map(({ name, priority, commanders = [], cards = [], basic_lands = basicLandsOf(), evaluation = null }, index) => {
    const time = nextTime();
    const deckId = `deck-${index + 1}`;
    for (const commander of commanders.filter(({ copy_id }) => !cards.some((card) => card.copy_id === copy_id))) {
      seedCopy({
        ...commander,
        printing_id: `printing-${commander.copy_id}`,
        set: 'cmm',
        collector_number: '1',
        image_uris: [`https://cards.scryfall.io/normal/front/${commander.copy_id}.jpg`],
        finish: 'nonfoil',
        condition: 'near_mint',
        language: 'en',
        added_at: time,
        type_line: 'Legendary Creature',
        membership: { deck_id: deckId, role: 'commander', commander_at: time, added_at: time },
      });
    }
    for (const { role, commander_at, added_at, planned_out, ...card } of cards) {
      const art = commanders.find((commander) => commander.copy_id === card.copy_id)?.art_crop_uri;
      seedCopy({ ...card, ...(art !== undefined && { art_crop_uri: art }), membership: { deck_id: deckId, role, commander_at, added_at } });
    }
    return { deck_id: deckId, name, priority, last_used_at: time, revision: 0, created_at: time, basic_lands, evaluation };
  });
  store.decksCreated = seeds.length;
}

export function ownDeckOfCopies(name: string, copies: CopyDetails[], evaluation: DeckEvaluation | null = null) {
  ownDecks([{ name, priority: 'medium', evaluation }]);
  ownCopies(copies.map((copy) => ({ ...copy, deck: { deck_id: 'deck-1', name, role: 'main', commander_art_crop_uri: null, commander_count: 0 } })));
}

export function evaluateNextDeckChange(deckId: string, evaluation: DeckEvaluation | null) {
  store.nextEvaluations.set(deckId, evaluation);
}

export function ownDeckChanges(deckId: string, changes: DeckChange[]) {
  store.deckChanges.set(deckId, changes);
}

export function ownRevertPreview(deckChangeId: string, preview: Omit<RevertPreview, 'revision'>) {
  store.revertPreviews.set(deckChangeId, preview);
}

export function ownAddPreviewEffects(effects: Record<string, DeckChangeEffect>) {
  store.addPreviewEffects = new Map(Object.entries(effects));
}

export function changeDeckElsewhere(deckId: string, change: DeckChange) {
  const deck = deckRecord(deckId)!;
  deck.revision = change.revision;
  store.deckChanges.set(deckId, [change, ...(store.deckChanges.get(deckId) ?? [])]);
}

export function decksOnTheServer() {
  return store.decks.map(deckOf);
}

export function copiesOnTheServer() {
  return store.copies.map(copyDetailsOf);
}

export function ownPlannedSwaps(swaps: PlannedSwap[]) {
  store.plannedSwaps = swaps.map((swap) => ({ ...swap }));
}

export function ownBuylistCards(cards: BuylistCard[]) {
  store.buylistCards = cards.map((card) => ({ ...card }));
}

export function ownFreeCopies(oracleId: string, copies: FreeCopy[]) {
  for (const copy of copies) {
    seedCopy({ ...copy, oracle_id: oracleId, added_at: new Date(Date.UTC(2026, 9, 12)).toISOString() });
  }
}

const deckWrites = [
  'create_deck',
  'mark_deck_used',
  'rename_deck',
  'set_deck_priority',
  'delete_deck',
  'add_deck_card',
  'set_deck_commander',
  'change_basic_land',
  'remove_deck_card',
  'revert_deck_changes',
  'swap_in_planned_swap',
  'swap_in_planned_swaps',
  'close_planned_swap',
  'mark_buylist_card_bought',
  'close_buylist_card',
] as const;

export function deckWritesSent() {
  return callsSent(deckWrites);
}

export function failDeckWrites(count: number) {
  fail(deckWrites, count);
}

export function failDeckReads(count: number) {
  fail(['list_decks', 'get_deck', 'preview_revert'], count);
}

export function failNeedsYouReads(count: number) {
  fail(['list_planned_swaps', 'list_buylist'], count);
}

export function failUserTagChanges(count: number) {
  fail(['create_user_tag', 'rename_user_tag', 'delete_user_tag', 'set_copy_user_tag'], count);
}

export function offerSets(rows: CardSet[]) {
  store.sets = rows;
}

export function offerSetPage(set: SetDetails) {
  store.setPages.set(set.code, set);
}

export function ownCollectionTotal(total: CollectionTotal) {
  store.collectionTotal = total;
}

export function offerCurrentPrices(rows: CurrentPriceRow[]) {
  store.currentPrices = new Map([...(store.currentPrices ?? []), ...rows.map((row) => [currentPriceKey(row), row.price] as const)]);
}

export function offerExchangeRates(currencies: string[], rateDate = testRateDate) {
  store.exchangeRates = exchangeRatesOf(currencies, rateDate);
}

export function answerCollectionSearches(answer: (query: CollectionQuery) => CollectionSearchAnswer) {
  store.collectionSearchAnswer = answer;
}

export function collectionSearchesSent() {
  return requestsSent('search_collection').flatMap(({ rows, cursor, limit, ...search }) => (cursor ? [] : [search]));
}

export function expirePageCursors() {
  store.cursorGeneration += 1;
}

export function publishGallery(version: string, { partNames = galleryPartNames, formatVersion = 2 } = {}) {
  store.galleryObjects = new Map([...store.galleryObjects, ...galleryObjectsOf(version, partNames, formatVersion)]);
}

export function uploadUnpublishedGallery(version: string) {
  store.galleryObjects.set(`${version}/manifest.json`, JSON.stringify({ formatVersion: 2, version, parts: [] }));
}

export function allowAiClients(seeds: { name: string; allowedAt: string }[]) {
  store.aiClients = seeds.map(({ name, allowedAt }, index) => ({
    client: { id: `ai-client-${index + 1}`, name, uri: '', logo_uri: '' },
    scopes: ['openid', 'email', 'profile'],
    granted_at: allowedAt,
  }));
}

export function aiClientsRevokedOnTheServer() {
  return store.aiClientRevokes;
}

export function trainingCropsUploaded() {
  return store.trainingCropUploads;
}

export function refuseNextTrainingCrop(code: string) {
  store.trainingCropRefusals = [...store.trainingCropRefusals, code];
}

export function turnTrainingCropUploadsOffElsewhere(email = defaultEmail) {
  store.trainingCropUploadsOff.add(email);
}

export function trainingCropUploadsAreOnTheServer(email = defaultEmail) {
  return !store.trainingCropUploadsOff.has(email);
}
