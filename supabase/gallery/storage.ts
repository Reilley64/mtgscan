import type { ImportClient } from '../import/import-run';
import { type Manifest, galleryBucket, pointerFile } from './manifest';

const immutable = '31536000';

export type RecordedVersion = {
  version: string;
  manifest: Manifest;
  uploaded_at: string;
  parity_lowest_cosine: number | null;
  parity_mean_cosine: number | null;
  parity_references: number | null;
  parity_checked_at: string | null;
  published_at: string | null;
};

export type ParityCheck = {
  lowestCosine: number;
  meanCosine: number;
  references: number;
};

export class GalleryRefused extends Error {}

function bucket(client: ImportClient) {
  return client.storage.from(galleryBucket);
}

export async function uploadObject(client: ImportClient, path: string, bytes: Uint8Array, contentType: string, upsert = false) {
  const { error } = await bucket(client).upload(path, bytes, {
    contentType,
    upsert,
    cacheControl: upsert ? '60' : immutable,
  });
  if (error) {
    throw new Error(`Could not upload ${path}: ${error.message}`);
  }
}

export async function copyObject(client: ImportClient, from: string, to: string) {
  const { error } = await bucket(client).copy(from, to);
  if (error) {
    throw new Error(`Could not copy ${from} to ${to}: ${error.message}`);
  }
}

export async function signedUrls(client: ImportClient, paths: string[], seconds: number): Promise<Map<string, string>> {
  const { data, error } = await bucket(client).createSignedUrls(paths, seconds);
  if (error || !data) {
    throw new Error(`Could not sign the gallery objects: ${error?.message ?? 'no data'}`);
  }
  return new Map(data.flatMap((entry) => (entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : [])));
}

export async function downloadObject(client: ImportClient, path: string): Promise<Uint8Array> {
  const { data, error } = await bucket(client).download(path);
  if (error || !data) {
    throw new Error(`Could not download ${path}: ${error?.message ?? 'no data'}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function listNames(client: ImportClient, prefix: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket(client).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      throw new Error(`Could not list ${prefix || 'the gallery bucket'}: ${error.message}`);
    }
    names.push(...data.map((entry) => entry.name));
    if (data.length < 1000) {
      return names;
    }
  }
}

export async function storedVersionFolders(client: ImportClient): Promise<string[]> {
  return (await listNames(client, '')).filter((name) => name !== pointerFile);
}

export async function removeVersionFolder(client: ImportClient, version: string) {
  const paths = (await listNames(client, version)).map((name) => `${version}/${name}`);
  if (paths.length === 0) {
    return;
  }
  const { error } = await bucket(client).remove(paths);
  if (error) {
    throw new Error(`Could not delete gallery version ${version}: ${error.message}`);
  }
}

function refusedOrFailed(action: string, error: { code?: string; message: string }): Error {
  const refusals = ['parity_missing', 'parity_failed', 'unknown_gallery_version', 'invalid_argument'];
  return refusals.includes(error.code ?? '') ? new GalleryRefused(error.message) : new Error(`${action}: ${error.message}`);
}

export async function recordedVersions(client: ImportClient): Promise<RecordedVersion[]> {
  const { data, error } = await client.from('gallery_versions').select('*').order('uploaded_at');
  if (error) {
    throw new Error(`Could not read the gallery versions: ${error.message}`);
  }
  return data as unknown as RecordedVersion[];
}

export function publishedVersions(versions: RecordedVersion[]): RecordedVersion[] {
  return versions
    .filter((version) => version.published_at !== null)
    .sort((a, b) => Date.parse(b.published_at!) - Date.parse(a.published_at!));
}

export async function recordVersion(client: ImportClient, manifest: Manifest) {
  const { error } = await client.rpc('record_gallery_version', { version: manifest.version, manifest });
  if (error) {
    throw refusedOrFailed('Could not record the gallery version', error);
  }
}

export async function recordParity(
  client: ImportClient,
  version: string,
  parity: ParityCheck,
): Promise<boolean> {
  const { data, error } = await client.rpc('record_gallery_parity', {
    version,
    lowest_cosine: parity.lowestCosine,
    mean_cosine: parity.meanCosine,
    reference_count: parity.references,
  });
  if (error) {
    throw refusedOrFailed('Could not record the parity check', error);
  }
  return data === true;
}

export async function markPublished(client: ImportClient, version: string): Promise<string> {
  const { data, error } = await client.rpc('publish_gallery_version', { version });
  if (error) {
    throw refusedOrFailed('Could not publish the gallery version', error);
  }
  return data;
}

export async function forgetVersion(client: ImportClient, version: string) {
  const { error } = await client.rpc('delete_gallery_version', { version });
  if (error) {
    throw refusedOrFailed(`Could not delete gallery version ${version}`, error);
  }
}
