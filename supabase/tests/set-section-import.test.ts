import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getSet } from '../sets';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { replyOf } from './database-calls';
import { anonymousClient, asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { importSetSections, storeSetSections } from './set-section-seeds';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

const roilCartographer = '84317f9d-5a24-4f74-9c3e-0a8b5c15bb5f';
const scurrilousSentry = '29e2805f-59fa-4a6d-97bc-266191b2aa8d';
const roilCartographerVariant = '7b9b743b-340d-4a15-a71d-d3108adbdc45';
const notInTheCardCatalog = '00000000-0000-4000-8000-000000000451';

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

afterEach(async () => {
  await asDatabaseOwner((database) => database`delete from public.set_sections`);
});

async function setSectionsOf(code: string) {
  const set = await replyOf(alice.client, getSet, { code });
  return set.sections.map((section) => ({
    name: section.name,
    card_printing_ids: section.card_printings.map((printing) => printing.printing_id),
  }));
}

async function setSectionsReadAt(code: string) {
  const { data, error } = await alice.client.from('card_sets').select('set_sections_read_at').eq('code', code).single();
  expect(error).toBeNull();
  return data!.set_sections_read_at;
}

describe('the set section import function', () => {
  test("storing a set's set sections replaces the set sections stored before and records when they were read", async () => {
    await storeSetSections('mh3', [
      { name: 'Draft Cards', search: 'e:mh3 cn≤261', card_printing_ids: [roilCartographer, scurrilousSentry] },
    ]);
    const firstRead = await setSectionsReadAt('mh3');

    await storeSetSections('mh3', [
      { name: 'Borderless Cards', search: 'e:mh3 cn≥500', card_printing_ids: [roilCartographerVariant] },
      { name: 'Roil Cartographer', search: 'e:mh3 !"Roil Cartographer"', card_printing_ids: [roilCartographer] },
    ]);

    expect(await setSectionsOf('mh3')).toEqual([
      { name: 'Borderless Cards', card_printing_ids: [roilCartographerVariant] },
      { name: 'Roil Cartographer', card_printing_ids: [roilCartographer] },
    ]);
    expect(firstRead).not.toBeNull();
    expect(Date.parse((await setSectionsReadAt('mh3'))!)).toBeGreaterThan(Date.parse(firstRead!));
  });

  test('card printing IDs that are not in the card catalog are dropped', async () => {
    await storeSetSections('mh3', [
      { name: 'Draft Cards', search: 'e:mh3 cn≤261', card_printing_ids: [roilCartographer, notInTheCardCatalog] },
    ]);

    const { data, error } = await alice.client.from('set_section_card_printings').select('card_printing_id').eq('set_code', 'mh3');

    expect(error).toBeNull();
    expect(data).toEqual([{ card_printing_id: roilCartographer }]);
  });

  test('a set code that is not in the card sets table is refused, and nothing is stored', async () => {
    const { error } = await importSetSections('zzz', [{ name: 'Draft Cards', search: 'e:zzz', card_printing_ids: [roilCartographer] }]);

    expect(error?.message).toBe('No card set has the code zzz.');
    const { data } = await alice.client.from('set_sections').select('set_code').eq('set_code', 'zzz');
    expect(data).toEqual([]);
  });

  test("a call that fails leaves the set's stored set sections and its read time unchanged", async () => {
    await storeSetSections('mh3', [{ name: 'Draft Cards', search: 'e:mh3 cn≤261', card_printing_ids: [roilCartographer] }]);
    const readAt = await setSectionsReadAt('mh3');

    const { error } = await importSetSections('mh3', [
      { name: 'Borderless Cards', search: 'e:mh3 cn≥500', card_printing_ids: [roilCartographerVariant] },
      { name: 'Broken', search: 'e:mh3', card_printing_ids: ['not a card printing ID'] },
    ]);

    expect(error).not.toBeNull();
    expect(await setSectionsOf('mh3')).toEqual([{ name: 'Draft Cards', card_printing_ids: [roilCartographer] }]);
    expect(await setSectionsReadAt('mh3')).toBe(readAt);
  });
});

describe('set section access', () => {
  test('a signed-in user reads set sections and their card printings', async () => {
    await storeSetSections('mh3', [{ name: 'Draft Cards', search: 'e:mh3 cn≤261', card_printing_ids: [roilCartographer] }]);

    const sections = await alice.client.from('set_sections').select('set_code, position, name, search');
    const printings = await alice.client.from('set_section_card_printings').select('set_code, position, card_printing_id');

    expect(sections.data).toEqual([{ set_code: 'mh3', position: 1, name: 'Draft Cards', search: 'e:mh3 cn≤261' }]);
    expect(printings.data).toEqual([{ set_code: 'mh3', position: 1, card_printing_id: roilCartographer }]);
  });

  test('an anonymous caller reads no set sections', async () => {
    await storeSetSections('mh3', [{ name: 'Draft Cards', search: 'e:mh3 cn≤261', card_printing_ids: [roilCartographer] }]);

    const sections = await anonymousClient().from('set_sections').select('set_code');
    const printings = await anonymousClient().from('set_section_card_printings').select('set_code');

    expect(sections.data ?? []).toEqual([]);
    expect(printings.data ?? []).toEqual([]);
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot write set sections', async (_caller, client) => {
    const writes = [
      client().from('set_sections').insert({ set_code: 'mh3', position: 1, name: 'Draft Cards', search: 'e:mh3' }),
      client().from('set_sections').update({ name: 'Changed' }).eq('set_code', 'mh3'),
      client().from('set_sections').delete().eq('set_code', 'mh3'),
      client().from('set_section_card_printings').insert({ set_code: 'mh3', position: 1, card_printing_id: roilCartographer }),
      client().from('set_section_card_printings').delete().eq('set_code', 'mh3'),
    ];

    for (const { error } of await Promise.all(writes)) {
      expect(error?.code).toBe(permissionDenied);
    }
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot call the set section import function', async (_caller, client) => {
    const { error } = await client().rpc('import_set_sections', { set_code: 'mh3', sections: [] });

    expect(error?.code).toBe(permissionDenied);
  });
});
