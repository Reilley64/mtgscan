import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { CardCondition, ScanBatch } from '../collection';
import type { Finish } from '../search';
import type { Database, Json } from '../database.types';
import { isLocalStack, localSupabaseUrl, testUser } from './account';

const usage = 'Usage: bun test-user/main.ts [--sample-collection]';
const sampleCollectionEntries = 30;
const sampleConditions: CardCondition[] = ['near_mint', 'near_mint', 'lightly_played', 'near_mint', 'moderately_played'];
const usersPerPage = 1000;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { 'sample-collection': { type: 'boolean', default: false } },
});

const url = process.env.SUPABASE_URL ?? localSupabaseUrl;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!isLocalStack(url)) {
  console.error(`The test user is only for local Supabase. Set SUPABASE_URL to the local stack, such as ${localSupabaseUrl}.`);
  process.exit(2);
}
if (!secretKey) {
  console.error('Set SUPABASE_SECRET_KEY to the SECRET_KEY value from `bunx supabase@2.120.0 status -o env`.');
  console.error(usage);
  process.exit(2);
}

type LocalClient = ReturnType<typeof localClient>;

function localClient() {
  return createClient<Database>(url, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fail(action: string, message: string): never {
  console.error(`${action}: ${message}`);
  process.exit(1);
}

async function existingTestUser(admin: LocalClient) {
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

async function removeTestUser(admin: LocalClient) {
  const user = await existingTestUser(admin);
  if (user) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      fail('Could not remove the test user', error.message);
    }
  }
}

async function createTestUser(admin: LocalClient) {
  const { error } = await admin.auth.admin.createUser({ ...testUser, email_confirm: true });
  if (error) {
    fail('Could not create the test user', error.message);
  }
}

function sampleFinish(finishes: Finish[], index: number): Finish {
  if (index % 3 === 2 && finishes.includes('foil')) {
    return 'foil';
  }
  return finishes.includes('nonfoil') ? 'nonfoil' : finishes[0]!;
}

async function sampleScanBatch(admin: LocalClient): Promise<ScanBatch> {
  const { data, error } = await admin
    .from('card_printings')
    .select('id, finishes')
    .is('absent_since', null)
    .in('rarity', ['uncommon', 'rare', 'mythic'])
    .order('id')
    .limit(sampleCollectionEntries);
  if (error) {
    fail('Could not read the card catalog', error.message);
  }
  if (data.length === 0) {
    fail('Could not add sample collection entries', 'The card catalog is empty. Import it first, as docs/agents/local-development.md says.');
  }
  return {
    items: data.map((printing, index) => ({
      card_printing_id: printing.id,
      finish: sampleFinish(printing.finishes, index),
      condition: sampleConditions[index % sampleConditions.length]!,
      language: 'en',
      copy_ids: Array.from({ length: (index % 4) + 1 }, () => crypto.randomUUID()),
    })),
  };
}

async function addSampleCollection(admin: LocalClient) {
  const batch = await sampleScanBatch(admin);
  const testUserClient = localClient();
  const { error: signInError } = await testUserClient.auth.signInWithPassword(testUser);
  if (signInError) {
    fail('Could not sign in as the test user', signInError.message);
  }
  const { error } = await testUserClient.rpc('add_scan_batch', { batch: batch as unknown as Json });
  if (error) {
    fail('Could not add sample collection entries', error.message);
  }
  console.log(`Added ${batch.items.length} sample collection entries.`);
}

const admin = localClient();
await removeTestUser(admin);
await createTestUser(admin);
console.log(`The test user ${testUser.email} is ready.`);
if (values['sample-collection']) {
  await addSampleCollection(admin);
}
