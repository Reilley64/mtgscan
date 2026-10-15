import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { CardCondition, CopyProtectedRequest, ScanBatch, UserTag } from '../collection';
import type { Finish } from '../search';
import type { Database, Json } from '../database.types';
import { isHostedTestUserPassword, isLocalStack, localSupabaseUrl, testUser } from './account';

const usage = 'Usage: bun test-user/main.ts [--hosted] [--sample-collection]';
const sampleCollectionEntries = 30;
const sampleUserTags = [
  { name: 'Signed', copies: 1 },
  { name: 'Trade binder', copies: 3 },
];
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
  console.error('Set SUPABASE_SECRET_KEY to the SECRET_KEY value from `bunx supabase@2.120.0 status -o env`.');
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

async function samplePrintings(admin: Client) {
  const printings = () =>
    admin.from('card_printings').select('id, finishes').is('absent_since', null).in('rarity', ['uncommon', 'rare', 'mythic']).order('id');
  const [etched, others] = await Promise.all([
    printings().contains('finishes', ['etched']).limit(1),
    printings().limit(sampleCollectionEntries),
  ]);
  const error = etched.error ?? others.error;
  if (error) {
    fail('Could not read the card catalog', error.message);
  }
  const etchedIds = etched.data!.map((printing) => printing.id);
  return [...etched.data!, ...others.data!.filter((printing) => !etchedIds.includes(printing.id))].slice(
    0,
    sampleCollectionEntries,
  );
}

async function sampleScanBatch(admin: Client): Promise<ScanBatch> {
  const data = await samplePrintings(admin);
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

async function addSampleCollection(admin: Client) {
  const batch = await sampleScanBatch(admin);
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

const admin = newClient();
await removeTestUser(admin);
await createTestUser(admin);
console.log(`The test user ${testUser.email} is ready.`);
if (values['sample-collection']) {
  await addSampleCollection(admin);
}
