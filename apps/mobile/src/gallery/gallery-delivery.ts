import { galleryBucket, pointerFile, type Pointer, type SignedVersion } from '@mtgscan/supabase/gallery-pointer';

import { supabase } from '@/lib/supabase';

import { downloadGallery, installedGallery } from '../../modules/card-recognizer';

const signedUrlSeconds = 7 * 24 * 60 * 60;

type ManifestParts = { parts: { name: string }[] };

type GallerySource = {
  version: string;
  manifest: () => Promise<string>;
  urls: (manifest: string) => Promise<Record<string, string>>;
};

export type GalleryCheck = 'up_to_date' | 'downloading';

export class GalleryOffline extends Error {}

function storageFailure(action: string, error: { name: string; message: string }): Error {
  return error.name === 'StorageUnknownError' ? new GalleryOffline(action) : new Error(`${action}: ${error.message}`);
}

async function storedText(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(galleryBucket).download(path);
  if (error) {
    throw storageFailure(`Could not read ${path}`, error);
  }
  return new Response(data).text();
}

async function signedPartUrls(version: string, manifest: string): Promise<Record<string, string>> {
  const paths = (JSON.parse(manifest) as ManifestParts).parts.map((part) => `${version}/${part.name}`);
  const { data, error } = await supabase.storage.from(galleryBucket).createSignedUrls(paths, signedUrlSeconds);
  if (error) {
    throw storageFailure('Could not sign the gallery parts', error);
  }
  return Object.fromEntries(
    data.flatMap((entry) => (entry.path && entry.signedUrl ? [[entry.path.slice(version.length + 1), entry.signedUrl]] : [])),
  );
}

async function publishedVersion(): Promise<GallerySource> {
  const pointer = JSON.parse(await storedText(pointerFile)) as Pointer;
  return {
    version: pointer.version,
    manifest: () => storedText(pointer.manifest),
    urls: (manifest) => signedPartUrls(pointer.version, manifest),
  };
}

function developmentVersion(): GallerySource | null {
  const signed = process.env.EXPO_PUBLIC_DEVELOPMENT_GALLERY;
  if (!__DEV__ || !signed) {
    return null;
  }
  const { version, manifest, parts } = JSON.parse(signed) as SignedVersion;
  return {
    version,
    manifest: async () => {
      const response = await fetch(manifest).catch(() => {
        throw new GalleryOffline('Could not read the manifest');
      });
      if (!response.ok) {
        throw new Error(`Could not read the manifest: HTTP ${response.status}`);
      }
      return response.text();
    },
    urls: async () => parts,
  };
}

export async function checkForGallery(allowsCellularAccess: boolean): Promise<GalleryCheck> {
  const source = developmentVersion() ?? (await publishedVersion());
  if ((await installedGallery())?.version === source.version) {
    return 'up_to_date';
  }
  const manifest = await source.manifest();
  await downloadGallery({
    version: source.version,
    manifest,
    urls: await source.urls(manifest),
    allowsCellularAccess,
  });
  return 'downloading';
}
