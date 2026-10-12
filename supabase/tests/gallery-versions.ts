import { asDatabaseOwner, secretKeyClient } from './local-stack';

export function testVersionId(): string {
  return `20261021-${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
}

export async function recordTestVersion(): Promise<string> {
  const version = testVersionId();
  const { error } = await secretKeyClient().rpc('record_gallery_version', { version, manifest: { version } });
  if (error) {
    throw new Error(error.message);
  }
  return version;
}

export async function cleanGallery(): Promise<void> {
  const bucket = secretKeyClient().storage.from('gallery');
  const { data: top, error } = await bucket.list('', { limit: 1000 });
  if (error) {
    throw new Error(error.message);
  }
  for (const entry of top) {
    const { data: inside } = await bucket.list(entry.name, { limit: 1000 });
    const paths = inside && inside.length > 0 ? inside.map((object) => `${entry.name}/${object.name}`) : [entry.name];
    await bucket.remove(paths);
  }
  await asDatabaseOwner((database) => database`delete from public.gallery_versions`);
}
