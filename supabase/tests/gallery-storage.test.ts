import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { basicLands, catalogFixture, resetCardCatalog, runCatalogImport, withBasicLands } from './catalog-import-command';
import { cleanGallery, recordTestVersion } from './gallery-versions';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const importKeyClient = secretKeyClient();
const manifestBytes = new TextEncoder().encode('{}');

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await cleanGallery();
});

afterAll(cleanGallery);

async function upload(path: string) {
  const { error } = await importKeyClient.storage
    .from('gallery')
    .upload(path, manifestBytes, { contentType: 'application/json', upsert: true });
  expect(error).toBeNull();
}

async function published(version: string) {
  expect((await importKeyClient.rpc('record_gallery_parity', {
    version,
    lowest_cosine: 0.9997,
    mean_cosine: 1,
    reference_count: 24,
  })).error).toBeNull();
  expect((await importKeyClient.rpc('publish_gallery_version', { version })).error).toBeNull();
}

describe('the gallery bucket', () => {
  let publishedVersion: string;
  let unpublishedVersion: string;

  beforeAll(async () => {
    publishedVersion = await recordTestVersion();
    unpublishedVersion = await recordTestVersion();
    await upload(`${publishedVersion}/manifest.json`);
    await upload(`${unpublishedVersion}/manifest.json`);
    await upload('published.json');
    await published(publishedVersion);
  });

  test('a signed-in user reads the pointer and a published gallery version', async () => {
    const pointer = await alice.client.storage.from('gallery').download('published.json');
    const manifest = await alice.client.storage.from('gallery').download(`${publishedVersion}/manifest.json`);

    expect(pointer.error).toBeNull();
    expect(manifest.error).toBeNull();
  });

  test('a signed-in user cannot read a gallery version that is not published', async () => {
    const { data, error } = await alice.client.storage.from('gallery').download(`${unpublishedVersion}/manifest.json`);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  test('a signed-in user gets a signed URL only for a published gallery version', async () => {
    const signed = await alice.client.storage.from('gallery').createSignedUrl(`${publishedVersion}/manifest.json`, 60);
    const refused = await alice.client.storage.from('gallery').createSignedUrl(`${unpublishedVersion}/manifest.json`, 60);

    expect(signed.error).toBeNull();
    expect(await (await fetch(signed.data!.signedUrl)).text()).toBe('{}');
    expect(refused.data).toBeNull();
  });

  test('an anonymous caller cannot read the gallery', async () => {
    const client = anonymousClient();
    const pointer = await client.storage.from('gallery').download('published.json');
    const manifest = await client.storage.from('gallery').download(`${publishedVersion}/manifest.json`);

    expect(pointer.data).toBeNull();
    expect(manifest.data).toBeNull();
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot write, replace, or delete gallery objects', async (_, client) => {
    const bucket = client().storage.from('gallery');
    const added = await bucket.upload(`${publishedVersion}/extra.zlib`, manifestBytes, { contentType: 'application/octet-stream' });
    const replaced = await bucket.upload('published.json', manifestBytes, { contentType: 'application/json', upsert: true });
    await bucket.remove([`${publishedVersion}/manifest.json`]);

    expect(added.error).not.toBeNull();
    expect(replaced.error).not.toBeNull();
    expect((await importKeyClient.storage.from('gallery').download(`${publishedVersion}/manifest.json`)).error).toBeNull();
  });
});

describe('publishing a gallery version', () => {
  test('a gallery version without a recorded parity check cannot be published', async () => {
    const version = await recordTestVersion();

    const { error } = await importKeyClient.rpc('publish_gallery_version', { version });

    expect(error).toMatchObject({ code: 'parity_missing', details: 'version' });
  });

  test.each([
    ['a lowest cosine below 0.98', 0.979, 24],
    ['fewer than 24 references', 0.9997, 23],
  ])('a parity check with %s cannot be published', async (_, lowestCosine, references) => {
    const version = await recordTestVersion();
    const recorded = await importKeyClient.rpc('record_gallery_parity', {
      version,
      lowest_cosine: lowestCosine,
      mean_cosine: 1,
      reference_count: references,
    });
    expect(recorded.error).toBeNull();

    const { error } = await importKeyClient.rpc('publish_gallery_version', { version });

    expect(error).toMatchObject({ code: 'parity_failed', details: 'version' });
  });

  test('a gallery version ID that is not a build date and a 6-character ID is refused', async () => {
    const version = '2026-10-21';

    const { error } = await importKeyClient.rpc('record_gallery_version', { version, manifest: { version } });

    expect(error).toMatchObject({ code: 'invalid_argument', details: 'version' });
  });

  test('an unknown gallery version cannot be published', async () => {
    const { error } = await importKeyClient.rpc('publish_gallery_version', { version: '20261021-000000' });

    expect(error).toMatchObject({ code: 'unknown_gallery_version', details: 'version' });
  });

  test('the published gallery version cannot be deleted', async () => {
    const version = await recordTestVersion();
    await published(version);

    const { error } = await importKeyClient.rpc('delete_gallery_version', { version });

    expect(error).toMatchObject({ code: 'invalid_argument', details: 'version' });
  });
});

describe('gallery versions and functions', () => {
  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot call the gallery functions or read gallery versions', async (_, client) => {
    const version = '20261021-111111';
    const calls = await Promise.all([
      client().rpc('list_gallery_printings', {}),
      client().rpc('record_gallery_version', { version, manifest: { version } }),
      client().rpc('record_gallery_parity', { version, lowest_cosine: 1, mean_cosine: 1, reference_count: 24 }),
      client().rpc('publish_gallery_version', { version }),
      client().rpc('delete_gallery_version', { version }),
      client().from('gallery_versions').select('version'),
    ]);

    for (const { error } of calls) {
      expect(error?.code).toBe(permissionDenied);
    }
  });

  test('the import key cannot write gallery versions directly', async () => {
    const { error } = await importKeyClient
      .from('gallery_versions')
      .insert({ version: '20261021-222222', manifest: { version: '20261021-222222' } });

    expect(error?.code).toBe(permissionDenied);
  });
});

describe('gallery printings', () => {
  let fogPrintings: string[];

  beforeAll(async () => {
    await resetCardCatalog();
    expect((await runCatalogImport(await catalogFixture({ oracleCards: withBasicLands, defaultCards: withBasicLands }))).exitCode).toBe(0);
    const { data } = await importKeyClient.from('card_printings').select('id, cards!inner(name)').eq('cards.name', 'Fog');
    fogPrintings = data!.map((row) => row.id);
    const withoutFog = await catalogFixture({
      updatedAt: '2026-10-15T21:00:00.000+00:00',
      oracleCards: withBasicLands,
      defaultCards: (records) => withBasicLands(records).filter((record) => record.name !== 'Fog'),
    });
    expect((await runCatalogImport(withoutFog)).exitCode).toBe(0);
  });

  async function galleryPrintings() {
    const rows: { id: string; basic_land: boolean }[] = [];
    for (let after: string | undefined; ; ) {
      const { data, error } = await importKeyClient.rpc('list_gallery_printings', after ? { after_id: after } : {});
      expect(error).toBeNull();
      if (data!.length === 0) {
        return rows;
      }
      rows.push(...data!);
      after = data!.at(-1)!.id;
    }
  }

  test('every card printing in the card catalog is listed once, and basic lands are flagged', async () => {
    const rows = await galleryPrintings();

    expect(rows).toHaveLength(351);
    expect(new Set(rows.map((row) => row.id)).size).toBe(351);
    expect(rows.filter((row) => row.basic_land).map((row) => row.id).sort()).toEqual(basicLands.map((land) => land.id).sort());
  });

  test('a card printing that the card catalog marks absent is not listed', async () => {
    const ids = new Set((await galleryPrintings()).map((row) => row.id));

    expect(fogPrintings).toHaveLength(3);
    expect(fogPrintings.filter((id) => ids.has(id))).toEqual([]);
  });
});
