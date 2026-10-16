import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { CardCondition, CopyProtectedRequest, ScanBatch, UserTag } from '../collection';
import type { Finish } from '../search';
import type { Database, Json } from '../database.types';
import type { AddedDeckCard, CreatedDeck, Deck, DeckChangePage } from '../decks';
import { isHostedTestUserPassword, isLocalStack, localSupabaseUrl, testUser } from './account';

const usage = 'Usage: bun test-user/main.ts [--hosted] [--sample-collection]';
const sampleCollectionEntries = 30;
const sampleUserTags = [
  { name: 'Signed', copies: 1 },
  { name: 'Trade binder', copies: 3 },
];
const sampleDeck = {
  commander: 'Tymna the Weaver',
  partner: 'Thrasios, Triton Hero',
  mainDeck: [
    'Rhystic Study',
    'Smothering Tithe',
    "Thassa's Oracle",
    'Demonic Consultation',
    'Time Warp',
    'Temporal Manipulation',
    'Once More with Feeling',
    'Black Lotus',
    'Lightning Bolt',
    'Mind Stone',
    'Counterspell',
    'Counterspell',
  ],
  revertedCard: 'Lightning Bolt',
};
const sampleDeckCards = [sampleDeck.commander, sampleDeck.partner, ...sampleDeck.mainDeck, sampleDeck.revertedCard];
const sampleDeckCardNames = [...new Set(sampleDeckCards)];
const sampleBasicLands: Record<string, number> = { Forest: 8, Island: 6, 'Snow-Covered Forest': 2 };
const sampleConditions: CardCondition[] = ['near_mint', 'near_mint', 'lightly_played', 'near_mint', 'moderately_played'];
const usersPerPage = 1000;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    hosted: { type: 'boolean', default: false },
    'sample-collection': { type: 'boolean', default: false },
  },
});

const url = process.env.SUPABASE_URL ?? localSupabaseUrl;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function testUserPassword(): string {
  if (!values.hosted) {
    if (!isLocalStack(url)) {
      console.error(`The test user is only for local Supabase. Set SUPABASE_URL to the local stack, such as ${localSupabaseUrl}.`);
      console.error('Use --hosted for the hosted test user.');
      process.exit(2);
    }
    return testUser.password;
  }
  const password = process.env.EXPO_PUBLIC_TEST_USER_PASSWORD;
  if (!isHostedTestUserPassword(password)) {
    console.error(
      'Set EXPO_PUBLIC_TEST_USER_PASSWORD to the hosted test user password from ~/.config/mtgscan/test-app.env. The local default password is refused.',
    );
    console.error(usage);
    process.exit(2);
  }
  return password;
}

const account = { email: testUser.email, password: testUserPassword() };

if (!secretKey) {
  console.error(
    values.hosted
      ? 'Load the hosted SUPABASE_URL and SUPABASE_SECRET_KEY with `bun --env-file=.env.hosted`.'
      : 'Set SUPABASE_SECRET_KEY to the SECRET_KEY value from `bunx supabase@2.120.0 status -o env`.',
  );
  console.error(usage);
  process.exit(2);
}

type Client = ReturnType<typeof newClient>;

function newClient() {
  return createClient<Database>(url, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fail(action: string, message: string): never {
  console.error(`${action}: ${message}`);
  process.exit(1);
}

async function existingTestUser(admin: Client) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: usersPerPage });
    if (error) {
      fail('Could not list the users', error.message);
    }
    const user = data.users.find((candidate) => candidate.email === testUser.email);
    if (user || data.users.length < usersPerPage) {
      return user;
    }
  }
}

async function removeTestUser(admin: Client) {
  const user = await existingTestUser(admin);
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      fail('Could not remove the test user', error.message);
    }
  }
}

async function createTestUser(admin: Client) {
  const { error } = await admin.auth.admin.createUser({ ...account, email_confirm: true });
  if (error) {
    fail('Could not create the test user', error.message);
  }
}

function sampleFinish(finishes: Finish[], index: number): Finish {
  if (finishes.includes('etched')) {
    return 'etched';
  }
  if (index % 3 === 2 && finishes.includes('foil')) {
    return 'foil';
  }
  return finishes.includes('nonfoil') ? 'nonfoil' : finishes[0]!;
}

type SamplePrinting = { id: string; oracle_id: string; finishes: Finish[]; cards: { name: string } };

function sampleCardPrintings(admin: Client) {
  return admin.from('card_printings').select('id, oracle_id, finishes, cards!inner(name)').is('absent_since', null).order('id');
}

async function requireCardCatalog(admin: Client) {
  const { count, error } = await admin.from('cards').select('oracle_id', { count: 'exact', head: true });
  if (error) {
    fail('Could not read the card catalog', error.message);
  }
  if (count === 0) {
    fail('Could not add sample collection entries', 'The card catalog is empty. Import it first, as docs/agents/local-development.md says.');
  }
}

async function sampleDeckPrintings(admin: Client): Promise<SamplePrinting[]> {
  const results = await Promise.all(
    sampleDeckCardNames.map((name) => sampleCardPrintings(admin).eq('lang', 'en').eq('cards.name', name).limit(1)),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) {
    fail('Could not read the card catalog', error.message);
  }
  const missing = sampleDeckCardNames.filter((_, index) => results[index]!.data!.length === 0);
  if (missing.length > 0) {
    fail('Could not add the sample deck', `The card catalog has no ${missing.join(', ')}.`);
  }
  return results.map((result) => result.data![0]!);
}

async function otherSamplePrintings(admin: Client, deckPrintings: SamplePrinting[]): Promise<SamplePrinting[]> {
  const entries = sampleCollectionEntries - deckPrintings.length;
  const printings = () =>
    sampleCardPrintings(admin)
      .in('rarity', ['uncommon', 'rare', 'mythic'])
      .not('oracle_id', 'in', `(${deckPrintings.map((printing) => printing.oracle_id).join(',')})`);
  const [etched, others] = await Promise.all([
    printings().contains('finishes', ['etched']).limit(1),
    printings().limit(entries),
  ]);
  const error = etched.error ?? others.error;
  if (error) {
    fail('Could not read the card catalog', error.message);
  }
  const etchedIds = etched.data!.map((printing) => printing.id);
  return [...etched.data!, ...others.data!.filter((printing) => !etchedIds.includes(printing.id))].slice(0, entries);
}

type SampleEntry = { printing: SamplePrinting; copies: number };

function sampleScanBatch(entries: SampleEntry[]): ScanBatch {
  return {
    items: entries.map(({ printing, copies }, index) => ({
      card_printing_id: printing.id,
      finish: sampleFinish(printing.finishes, index),
      condition: sampleConditions[index % sampleConditions.length]!,
      language: 'en',
      copy_ids: Array.from({ length: copies }, () => crypto.randomUUID()),
    })),
  };
}

function sampleDeckCopyIds(batch: ScanBatch, deckPrintings: SamplePrinting[]): string[] {
  const deckItems = batch.items.slice(-deckPrintings.length);
  const copyIds = new Map(deckPrintings.map((printing, index) => [printing.cards.name, [...deckItems[index]!.copy_ids]]));
  return sampleDeckCards.map((name) => copyIds.get(name)!.shift()!);
}

async function addSampleCollection(admin: Client) {
  await requireCardCatalog(admin);
  const deckPrintings = await sampleDeckPrintings(admin);
  const otherPrintings = await otherSamplePrintings(admin, deckPrintings);
  const batch = sampleScanBatch([
    ...otherPrintings.map((printing, index) => ({ printing, copies: (index % 4) + 1 })),
    ...deckPrintings.map((printing) => ({
      printing,
      copies: sampleDeckCards.filter((name) => name === printing.cards.name).length,
    })),
  ]);
  const testUserClient = newClient();
  const { error: signInError } = await testUserClient.auth.signInWithPassword(account);
  if (signInError) {
    fail('Could not sign in as the test user', signInError.message);
  }
  const { error } = await testUserClient.rpc('add_scan_batch', { batch: batch as unknown as Json });
  if (error) {
    fail('Could not add sample collection entries', error.message);
  }
  console.log(`Added ${batch.items.length} sample collection entries.`);
  const request: CopyProtectedRequest = { copy_id: batch.items[0]!.copy_ids[0]!, protected: true };
  const { error: protectError } = await testUserClient.rpc('set_copy_protected', { request });
  if (protectError) {
    fail('Could not protect a sample copy', protectError.message);
  }
  console.log('Protected 1 sample copy.');
  await addSampleUserTags(testUserClient, batch.items.map((item) => item.copy_ids[0]!));
  await addSampleDeck(testUserClient, sampleDeckCopyIds(batch, deckPrintings));
}

async function addSampleUserTags(testUserClient: Client, copyIds: string[]) {
  for (const { name, copies } of sampleUserTags) {
    const { data, error } = await testUserClient.rpc('create_user_tag', { request: { name } });
    if (error) {
      fail('Could not add sample user tags', error.message);
    }
    const { user_tag_id } = data as unknown as UserTag;
    for (const copyId of copyIds.slice(0, copies)) {
      const { error: userTagError } = await testUserClient.rpc('set_copy_user_tag', {
        request: { copy_id: copyId, user_tag_id, tagged: true },
      });
      if (userTagError) {
        fail('Could not add sample user tags', userTagError.message);
      }
    }
  }
  console.log(`Added ${sampleUserTags.length} sample user tags.`);
}

type DeckWrite = 'create_deck' | 'add_deck_card' | 'set_deck_commander' | 'set_basic_lands' | 'revert_deck_changes';

async function deckWrite<Result>(testUserClient: Client, write: DeckWrite, request: object): Promise<Result> {
  const { data, error } = await testUserClient.rpc(write, { request: request as Json });
  if (error) {
    fail('Could not add the sample deck', error.message);
  }
  return data as unknown as Result;
}

async function deckRead<Result>(testUserClient: Client, read: 'get_deck' | 'list_deck_changes', query: object): Promise<Result> {
  const { data, error } = await testUserClient.rpc(read, { query: query as Json });
  if (error) {
    fail('Could not read the sample deck', error.message);
  }
  return data as unknown as Result;
}

async function addSampleDeck(testUserClient: Client, copyIds: string[]) {
  const [commander, partner, ...rest] = copyIds;
  const mainDeck = rest.slice(0, -1);
  const revertedCopy = rest.at(-1)!;
  const { deck_id } = await deckWrite<CreatedDeck>(testUserClient, 'create_deck', {
    name: sampleDeck.commander,
  });
  for (const copyId of [commander!, partner!, ...mainDeck]) {
    await deckWrite(testUserClient, 'add_deck_card', { deck_id, copy_id: copyId, unprotect: false });
  }
  for (const copyId of [commander!, partner!]) {
    await deckWrite(testUserClient, 'set_deck_commander', { copy_id: copyId, commander: true });
  }
  const { basic_lands } = await deckRead<Deck>(testUserClient, 'get_deck', { deck_id });
  const counts = basic_lands.flatMap(({ oracle_id, name }) =>
    oracle_id && sampleBasicLands[name] ? [{ oracle_id, count: sampleBasicLands[name] }] : [],
  );
  if (counts.length > 0) {
    await deckWrite(testUserClient, 'set_basic_lands', { deck_id, counts });
  }
  const { revision } = await deckWrite<AddedDeckCard>(testUserClient, 'add_deck_card', {
    deck_id,
    copy_id: revertedCopy,
    unprotect: false,
  });
  const { items } = await deckRead<DeckChangePage>(testUserClient, 'list_deck_changes', { deck_id, limit: 1 });
  await deckWrite(testUserClient, 'revert_deck_changes', {
    deck_id,
    deck_change_id: items[0]!.deck_change_id,
    expected_revision: revision,
    unprotect: false,
  });
  const basicLandCount = counts.reduce((total, { count }) => total + count, 0);
  console.log(
    `Added a sample deck with 2 commanders, ${mainDeck.length} main deck cards, ${basicLandCount} basic lands, and ${revision + 1} deck changes.`,
  );
  const { evaluation } = await deckRead<Deck>(testUserClient, 'get_deck', { deck_id });
  console.log(`The sample deck is ${evaluation!.validity}, with estimated bracket ${evaluation!.estimated_bracket}.`);
}

const admin = newClient();
await removeTestUser(admin);
await createTestUser(admin);
console.log(`The test user ${testUser.email} is ready.`);
if (values['sample-collection']) {
  await addSampleCollection(admin);
}
