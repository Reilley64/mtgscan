import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import { addScanBatch, createUserTag, setCopyProtected, setCopyUserTag, type CardCondition, type ScanBatch } from '../collection';
import { callDatabaseFunction, type DatabaseFunction, type ReplyOf, type RequestArguments } from '../database-function';
import type { Database } from '../database.types';
import { addDeckCard, changeBasicLand, createDeck, getDeck, listDeckChanges, revertDeckChanges, setDeckCommander } from '../decks';
import type { Finish } from '../search';
import { hostedSupabaseUrl, isHostedTestUserPassword, isLocalStack, localSupabaseUrl, testUser } from './account';

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

function refuse(message: string): never {
  console.error(message);
  console.error(usage);
  process.exit(2);
}

function supabaseUrl(): string {
  if (!values.hosted) {
    return process.env.SUPABASE_URL ?? localSupabaseUrl;
  }
  const hosted = hostedSupabaseUrl(process.env);
  if ('refusal' in hosted) {
    refuse(hosted.refusal);
  }
  return hosted.url;
}

const url = supabaseUrl();
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
    refuse(
      'Set EXPO_PUBLIC_TEST_USER_PASSWORD to the hosted test user password from ~/.config/mtgscan/test-app.env. The local default password is refused.',
    );
  }
  return password;
}

const account = { email: testUser.email, password: testUserPassword() };

if (!secretKey) {
  refuse(
    values.hosted
      ? `Load the SUPABASE_SECRET_KEY of ${url} with \`bun --env-file=.env.hosted\`.`
      : 'Set SUPABASE_SECRET_KEY to the SECRET_KEY value from `bunx supabase@2.120.0 status -o env`.',
  );
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

function sampleCardPrintings(admin: Client) {
  return admin.from('card_printings').select('id, oracle_id, finishes, cards!inner(name)').is('absent_since', null).order('id');
}

type SamplePrinting = NonNullable<Awaited<ReturnType<typeof sampleCardPrintings>>['data']>[number];

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

type SampleDeckCopies = { commander: string; partner: string; mainDeck: string[]; revertedCopy: string };

function sampleDeckCopies(deckPrintings: SamplePrinting[], deckItems: ScanBatch['items']): SampleDeckCopies {
  const copyIds = new Map(deckPrintings.map((printing, index) => [printing.cards.name, [...deckItems[index]!.copy_ids]]));
  const takeCopy = (name: string) => copyIds.get(name)!.shift()!;
  return {
    commander: takeCopy(sampleDeck.commander),
    partner: takeCopy(sampleDeck.partner),
    mainDeck: sampleDeck.mainDeck.map(takeCopy),
    revertedCopy: takeCopy(sampleDeck.revertedCard),
  };
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
  await replied(testUserClient, 'Could not add sample collection entries', addScanBatch, batch);
  console.log(`Added ${batch.items.length} sample collection entries.`);
  await replied(testUserClient, 'Could not protect a sample copy', setCopyProtected, {
    copy_id: batch.items[0]!.copy_ids[0]!,
    protected: true,
  });
  console.log('Protected 1 sample copy.');
  await addSampleUserTags(testUserClient, batch.items.map((item) => item.copy_ids[0]!));
  await addSampleDeck(testUserClient, sampleDeckCopies(deckPrintings, batch.items.slice(otherPrintings.length)));
}

async function replied<Contract extends DatabaseFunction>(
  testUserClient: Client,
  action: string,
  contract: Contract,
  ...request: RequestArguments<Contract>
): Promise<ReplyOf<Contract>> {
  const result = await callDatabaseFunction(testUserClient, contract, ...request);
  if (result.status === 'refused') {
    fail(action, result.refusal.message);
  }
  if (result.status === 'failed') {
    fail(action, result.error.message);
  }
  return result.reply;
}

async function addSampleUserTags(testUserClient: Client, copyIds: string[]) {
  const action = 'Could not add sample user tags';
  for (const { name, copies } of sampleUserTags) {
    const { user_tag_id } = await replied(testUserClient, action, createUserTag, { name });
    for (const copyId of copyIds.slice(0, copies)) {
      await replied(testUserClient, action, setCopyUserTag, { copy_id: copyId, user_tag_id, tagged: true });
    }
  }
  console.log(`Added ${sampleUserTags.length} sample user tags.`);
}

async function addSampleDeck(testUserClient: Client, { commander, partner, mainDeck, revertedCopy }: SampleDeckCopies) {
  const write = 'Could not add the sample deck';
  const read = 'Could not read the sample deck';
  const { deck_id } = await replied(testUserClient, write, createDeck, { name: sampleDeck.commander });
  for (const copyId of [commander, partner, ...mainDeck]) {
    await replied(testUserClient, write, addDeckCard, { deck_id, copy_id: copyId, unprotect: false });
  }
  for (const copyId of [commander, partner]) {
    await replied(testUserClient, write, setDeckCommander, { copy_id: copyId, commander: true });
  }
  const { basic_lands } = await replied(testUserClient, read, getDeck, { deck_id });
  const counts = basic_lands.flatMap(({ oracle_id, name }) =>
    oracle_id && sampleBasicLands[name] ? [{ oracle_id, count: sampleBasicLands[name] }] : [],
  );
  for (const { oracle_id, count } of counts) {
    await replied(testUserClient, write, changeBasicLand, { deck_id, oracle_id, by: count });
  }
  const { revision } = await replied(testUserClient, write, addDeckCard, { deck_id, copy_id: revertedCopy, unprotect: false });
  const { items } = await replied(testUserClient, read, listDeckChanges, { deck_id, limit: 1 });
  await replied(testUserClient, write, revertDeckChanges, {
    deck_id,
    deck_change_id: items[0]!.deck_change_id,
    expected_revision: revision,
    unprotect: false,
  });
  const basicLandCount = counts.reduce((total, { count }) => total + count, 0);
  console.log(
    `Added a sample deck with 2 commanders, ${mainDeck.length} main deck cards, ${basicLandCount} basic lands, and ${revision + 1} deck changes.`,
  );
  const { evaluation } = await replied(testUserClient, read, getDeck, { deck_id });
  console.log(`The sample deck is ${evaluation!.validity}, with estimated bracket ${evaluation!.estimated_bracket}.`);
}

const admin = newClient();
await removeTestUser(admin);
await createTestUser(admin);
console.log(`The test user ${testUser.email} is ready.`);
if (values['sample-collection']) {
  await addSampleCollection(admin);
}
