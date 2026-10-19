import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { freePlan } from '../gallery/budget';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { connectAiClient } from './ai-clients';
import {
  anonymousClient,
  asDatabaseOwner,
  secretKeyClient,
  signUpNewUser,
  tokenClient,
  type AppClient,
  type TestUser,
} from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';
import { angelicCurator, delverInnistrad, evidenceRecord, jpeg } from './training-crop-seeds';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const secretKey = secretKeyClient();

let alice: TestUser;
let aliceCopyId: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  alice = await signUpNewUser();
  aliceCopyId = await scannedCopy(alice);
});

async function scannedCopy(user: TestUser): Promise<string> {
  const scanned = stack(angelicCurator);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

type Upload = { image?: Blob | null; copyId?: string; crop?: unknown };

async function upload(client: AppClient, { image = jpeg(), copyId = aliceCopyId, crop = evidenceRecord() }: Upload) {
  const body = new FormData();
  if (image) {
    body.append('image', image, 'crop.jpg');
  }
  body.append('copy_id', copyId);
  body.append('crop', typeof crop === 'string' ? crop : JSON.stringify(crop));
  const { error } = await client.functions.invoke('training-crops', { body });
  if (!error) {
    return { status: 204, refusal: null };
  }
  const response = error.context as Response;
  return { status: response.status, refusal: await response.json() };
}

async function storedRow(cropId: string) {
  const { data, error } = await secretKey.from('training_crops').select('*').eq('crop_id', cropId);
  expect(error).toBeNull();
  return data!;
}

async function storedCounts() {
  const [counts] = await asDatabaseOwner(
    (database) => database`
      select
        (select count(*) from public.training_crops)::integer as rows,
        (select count(*) from storage.objects where bucket_id = 'training-crops')::integer as objects
    `,
  );
  return counts;
}

function storedObjects(cropId: string) {
  return asDatabaseOwner(
    (database) => database`
      select name, owner, owner_id, user_metadata
      from storage.objects
      where bucket_id = 'training-crops' and name = ${`${cropId}.jpg`}
    `,
  );
}

describe('uploading a training crop', () => {
  test('an upload for a copy of the caller stores the evidence record and the image', async () => {
    const crop = evidenceRecord();

    const result = await upload(alice.client, { crop });

    expect(result).toEqual({ status: 204, refusal: null });
    expect(await storedRow(crop.crop_id)).toEqual([crop]);
    const image = await secretKey.storage.from('training-crops').download(`${crop.crop_id}.jpg`);
    expect(image.error).toBeNull();
    expect(image.data!.size).toBe(jpeg().size);
  });

  test('a stored training crop holds no user ID, copy ID, or time, and its image has no owner and no metadata', async () => {
    const crop = evidenceRecord({ crop_id: crypto.randomUUID() });

    await upload(alice.client, { crop });

    const [row] = await storedRow(crop.crop_id);
    expect(Object.keys(row!).sort()).toEqual(Object.keys(evidenceRecord()).sort());
    expect(Object.values(row!)).not.toContain(alice.userId);
    expect(Object.values(row!)).not.toContain(aliceCopyId);
    expect([...(await storedObjects(crop.crop_id))]).toEqual([
      { name: `${crop.crop_id}.jpg`, owner: null, owner_id: null, user_metadata: {} },
    ]);
  });

  test('a retry of the same training crop succeeds and stores nothing more', async () => {
    const crop = evidenceRecord();

    const first = await upload(alice.client, { crop });
    const retry = await upload(alice.client, { crop: { ...crop, top_similarity: 0.5 } });

    expect(first.status).toBe(204);
    expect(retry.status).toBe(204);
    expect(await storedRow(crop.crop_id)).toEqual([crop]);
    expect(await storedObjects(crop.crop_id)).toHaveLength(1);
  });

  test('an abstain with a changed card printing is stored with its evidence record', async () => {
    const crop = evidenceRecord({
      accepted: false,
      decision_basis: null,
      art_margin: null,
      reading_set_code: null,
      reading_collector_number: null,
      reading_names_saved_printing: false,
      recognized_printing_id: delverInnistrad,
      printing_change: 'name_search',
    });

    expect((await upload(alice.client, { crop })).status).toBe(204);
    expect(await storedRow(crop.crop_id)).toEqual([crop]);
  });

  test("a copy of another user, or a copy that does not exist, is refused with unknown_copy and nothing is stored", async () => {
    const bob = await signUpNewUser();
    const bobsCopy = await scannedCopy(bob);
    const crops = [evidenceRecord(), evidenceRecord()];

    const results = [
      await upload(alice.client, { copyId: bobsCopy, crop: crops[0] }),
      await upload(alice.client, { copyId: crypto.randomUUID(), crop: crops[1] }),
    ];

    for (const result of results) {
      expect(result).toMatchObject({ status: 400, refusal: { code: 'unknown_copy', details: 'copy_id' } });
    }
    for (const crop of crops) {
      expect(await storedRow(crop.crop_id)).toEqual([]);
      expect(await storedObjects(crop.crop_id)).toHaveLength(0);
    }
  });

  test.each([
    ['a missing image', () => ({ image: null }), 'image'],
    ['an image that is not a JPEG', () => ({ image: new Blob([jpeg()], { type: 'image/png' }) }), 'image'],
    ['an image over 1 MB', () => ({ image: jpeg(1_000_000) }), 'image'],
    ['a copy ID that is not a UUID', () => ({ copyId: 'copy' }), 'copy_id'],
    ['a crop that is not JSON', () => ({ crop: 'crop' }), 'crop'],
    ['a crop with an unknown field', () => ({ crop: { ...evidenceRecord(), user_id: alice.userId } }), 'crop.user_id'],
    ['a crop without a field', () => ({ crop: { ...evidenceRecord(), policy_version: undefined } }), 'crop.policy_version'],
    ['a crop ID that is not a UUID', () => ({ crop: evidenceRecord({ crop_id: 'crop' }) }), 'crop.crop_id'],
    ['a crop ID that is the copy ID', () => ({ crop: evidenceRecord({ crop_id: aliceCopyId }) }), 'crop.crop_id'],
    ['an unknown decision basis', () => ({ crop: { ...evidenceRecord(), decision_basis: 'guess' } }), 'crop.decision_basis'],
    ['an accept with no decision basis', () => ({ crop: evidenceRecord({ decision_basis: null }) }), 'crop.decision_basis'],
    ['an abstain with a decision basis', () => ({ crop: evidenceRecord({ accepted: false }) }), 'crop.decision_basis'],
    ['no decision reasons', () => ({ crop: evidenceRecord({ decision_reasons: [] }) }), 'crop.decision_reasons'],
    ['a top similarity that is not a number', () => ({ crop: { ...evidenceRecord(), top_similarity: '0.9' } }), 'crop.top_similarity'],
    ['a fractional same-text twin count', () => ({ crop: evidenceRecord({ same_text_twin_count: 0.5 }) }), 'crop.same_text_twin_count'],
    ['an unknown printing change', () => ({ crop: { ...evidenceRecord(), printing_change: 'guess' } }), 'crop.printing_change'],
    [
      'a saved card printing that is not in the card catalog',
      () => ({ crop: evidenceRecord({ saved_printing_id: crypto.randomUUID() }) }),
      'crop.saved_printing_id',
    ],
    [
      'a first card printing that is not in the card catalog',
      () => ({ crop: evidenceRecord({ recognized_printing_id: crypto.randomUUID() }) }),
      'crop.recognized_printing_id',
    ],
  ])('%s is refused with invalid_argument on the field at fault, and nothing is stored', async (_, changes: () => Upload, field) => {
    const before = await storedCounts();

    const result = await upload(alice.client, changes());

    expect(result).toMatchObject({ status: 400, refusal: { code: 'invalid_argument', details: field } });
    expect(await storedCounts()).toEqual(before);
  });
});

describe('who can upload training crops', () => {
  test("an AI client's token is refused and nothing is stored", async () => {
    const { token } = await connectAiClient(alice);
    const crop = evidenceRecord();

    const result = await upload(tokenClient(token), { crop });

    expect(result).toMatchObject({ status: 403, refusal: { code: 'insufficient_privilege' } });
    expect(await storedRow(crop.crop_id)).toEqual([]);
    expect(await storedObjects(crop.crop_id)).toHaveLength(0);
  });

  test('an anonymous caller is refused and nothing is stored', async () => {
    const crop = evidenceRecord();

    const result = await upload(anonymousClient(), { crop });

    expect(result.status).toBe(401);
    expect(await storedRow(crop.crop_id)).toEqual([]);
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot call add_training_crop', async (_, client) => {
    const { error } = await client().rpc('add_training_crop', {
      request: { user_id: alice.userId, copy_id: aliceCopyId, crop: evidenceRecord() },
    });

    expect(error?.code).toBe(permissionDenied);
  });
});

describe('the training crop uploads setting', () => {
  async function settingsOf(client: AppClient) {
    return client.rpc('get_training_crop_settings');
  }

  test('training crop uploads are on for a new user', async () => {
    const user = await signUpNewUser();

    expect(await settingsOf(user.client)).toMatchObject({ data: { uploads_on: true }, error: null });
  });

  test("a user turns training crop uploads off and on, and another user's setting stays on", async () => {
    const user = await signUpNewUser();
    const other = await signUpNewUser();

    const off = await user.client.rpc('set_training_crop_uploads', { request: { on: false } });
    expect(off).toMatchObject({ data: { uploads_on: false }, error: null });
    expect((await settingsOf(user.client)).data).toEqual({ uploads_on: false });
    expect((await settingsOf(other.client)).data).toEqual({ uploads_on: true });

    const on = await user.client.rpc('set_training_crop_uploads', { request: { on: true } });
    expect(on).toMatchObject({ data: { uploads_on: true }, error: null });
    expect((await settingsOf(user.client)).data).toEqual({ uploads_on: true });
  });

  test.each([
    ['a missing on', {}, 'on'],
    ['an on that is not a boolean', { on: 'off' }, 'on'],
    ['an unknown field', { on: false, user_id: crypto.randomUUID() }, 'user_id'],
  ])('%s is refused with invalid_argument and changes nothing', async (_, request, field) => {
    const user = await signUpNewUser();

    const { error } = await user.client.rpc('set_training_crop_uploads', { request });

    expect(error).toMatchObject({ code: 'invalid_argument', details: field });
    expect((await settingsOf(user.client)).data).toEqual({ uploads_on: true });
  });

  test("an AI client's token cannot change training crop uploads", async () => {
    const user = await signUpNewUser();
    const { token } = await connectAiClient(user);

    const { error } = await tokenClient(token).rpc('set_training_crop_uploads', { request: { on: false } });

    expect(error?.code).toBe(permissionDenied);
    expect((await settingsOf(user.client)).data).toEqual({ uploads_on: true });
  });

  test('an anonymous caller cannot read or change training crop uploads', async () => {
    const read = await settingsOf(anonymousClient());
    const written = await anonymousClient().rpc('set_training_crop_uploads', { request: { on: false } });

    expect(read.error?.code).toBe(permissionDenied);
    expect(written.error?.code).toBe(permissionDenied);
  });

  test('an upload while the user has training crop uploads off is refused with uploads_off and nothing is stored', async () => {
    const user = await signUpNewUser();
    const copyId = await scannedCopy(user);
    await user.client.rpc('set_training_crop_uploads', { request: { on: false } });
    const crop = evidenceRecord();

    const result = await upload(user.client, { copyId, crop });

    expect(result).toMatchObject({ status: 400, refusal: { code: 'uploads_off' } });
    expect(await storedRow(crop.crop_id)).toEqual([]);
    expect(await storedObjects(crop.crop_id)).toHaveLength(0);
  });
});

describe('the training crops bucket and table', () => {
  let storedCropId: string;

  beforeAll(async () => {
    const crop = evidenceRecord();
    expect((await upload(alice.client, { crop })).status).toBe(204);
    storedCropId = crop.crop_id;
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot read, list, upload, or delete training crop images', async (_, client) => {
    const bucket = client().storage.from('training-crops');
    const path = `${storedCropId}.jpg`;

    const read = await bucket.download(path);
    const signed = await bucket.createSignedUrl(path, 60);
    const listed = await bucket.list();
    const added = await bucket.upload(`${crypto.randomUUID()}.jpg`, jpeg(), { contentType: 'image/jpeg' });
    const replaced = await bucket.upload(path, jpeg(10), { contentType: 'image/jpeg', upsert: true });
    await bucket.remove([path]);

    expect(read.data).toBeNull();
    expect(signed.data).toBeNull();
    expect(listed.data ?? []).toEqual([]);
    expect(added.error).not.toBeNull();
    expect(replaced.error).not.toBeNull();
    const kept = await secretKey.storage.from('training-crops').download(path);
    expect(kept.data!.size).toBe(jpeg().size);
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('%s cannot read or write training crops', async (_, client) => {
    const read = await client().from('training_crops').select('crop_id');
    const written = await client().from('training_crops').insert(evidenceRecord());

    expect(read.error?.code).toBe(permissionDenied);
    expect(written.error?.code).toBe(permissionDenied);
  });

  test('the secret key cannot write training crops directly', async () => {
    const { error } = await secretKey.from('training_crops').insert(evidenceRecord());

    expect(error?.code).toBe(permissionDenied);
  });
});

describe('the Storage limit', () => {
  const galleryObjects: string[] = [];

  afterEach(async () => {
    await setStorageLimit(freePlan.storageBytes);
    await secretKey.storage.from('gallery').remove(galleryObjects.splice(0));
  });

  async function storedBytes(): Promise<number> {
    const [{ bytes }] = await asDatabaseOwner(
      (database) => database`select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as bytes from storage.objects`,
    );
    return Number(bytes);
  }

  function setStorageLimit(bytes: number) {
    return asDatabaseOwner((database) => database`update private.storage_limit set bytes = ${bytes}`);
  }

  test('the Storage limit is the Free plan Storage of the gallery budget report', async () => {
    const [{ bytes }] = await asDatabaseOwner((database) => database`select bytes from private.storage_limit`);

    expect(Number(bytes)).toBe(freePlan.storageBytes);
  });

  test('an upload is refused with storage_full when the objects in every bucket reach 90% of the Storage limit, and nothing is stored', async () => {
    const galleryObject = `storage-limit-${crypto.randomUUID()}.bin`;
    galleryObjects.push(galleryObject);
    const stored = await secretKey.storage.from('gallery').upload(galleryObject, new Blob([new Uint8Array(1_000_000)]), {
      contentType: 'application/octet-stream',
    });
    expect(stored.error).toBeNull();
    await setStorageLimit(Math.floor((await storedBytes()) / 0.9));
    const before = await storedCounts();
    const crop = evidenceRecord();

    const result = await upload(alice.client, { crop });

    expect(result).toMatchObject({ status: 400, refusal: { code: 'storage_full' } });
    expect(await storedCounts()).toEqual(before);
  });

  test('an upload is stored while the objects in every bucket stay under 90% of the Storage limit', async () => {
    expect((await upload(alice.client, {})).status).toBe(204);
    await setStorageLimit(Math.floor((await storedBytes()) / 0.9) + 2);
    const crop = evidenceRecord();

    const result = await upload(alice.client, { crop });

    expect(result.status).toBe(204);
    expect(await storedRow(crop.crop_id)).toEqual([crop]);
  });
});
