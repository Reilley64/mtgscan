import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readGzipJsonLines } from '../import/gzip-json-lines';
import { importUserAgent } from '../import/source-file';
import type { ScryfallCard } from '../import/scryfall-bulk-data';
import type { GalleryPrinting } from './printings';

const downloadConcurrency = 8;
const attempts = 4;
const indexFile = 'images.json';

export type ImageCache = {
  directory: string;
  imageFile: (id: string) => string;
};

export type ImageCacheReport = {
  cached: number;
  downloaded: number;
  replaced: number;
  failed: string[];
};

async function imageUrlsFromBulkFile(file: string): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for await (const record of readGzipJsonLines(Bun.file(file).stream())) {
    const card = record as ScryfallCard;
    const image = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
    if (card.id && image) {
      urls.set(card.id, image);
    }
  }
  return urls;
}

async function download(url: string, file: string): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': importUserAgent, Accept: 'image/*' } });
      if (response.ok) {
        await writeFile(`${file}.tmp`, new Uint8Array(await response.arrayBuffer()));
        await rename(`${file}.tmp`, file);
        return true;
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await Bun.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    } catch {
      await Bun.sleep(1000 * 2 ** attempt);
    }
  }
  return false;
}

export async function cachedImages(
  directory: string,
  printings: GalleryPrinting[],
  cachedImagesBulkFile?: string,
): Promise<{ cache: ImageCache; report: ImageCacheReport }> {
  await mkdir(directory, { recursive: true });
  const indexPath = join(directory, indexFile);
  const index: Record<string, string> = existsSync(indexPath) ? await Bun.file(indexPath).json() : {};
  const earlierUrls = cachedImagesBulkFile ? await imageUrlsFromBulkFile(cachedImagesBulkFile) : new Map<string, string>();
  const imageFile = (id: string) => join(directory, `${id}.jpg`);
  const report: ImageCacheReport = { cached: 0, downloaded: 0, replaced: 0, failed: [] };
  const jobs: { printing: GalleryPrinting; replaced: boolean }[] = [];
  for (const printing of printings) {
    const { id } = printing.printing;
    const recorded = index[id] ?? earlierUrls.get(id);
    const present = existsSync(imageFile(id));
    if (present && (recorded === undefined || recorded === printing.image)) {
      index[id] = printing.image;
      report.cached += 1;
    } else {
      jobs.push({ printing, replaced: present });
    }
  }
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next]!;
      next += 1;
      const { id } = job.printing.printing;
      if (await download(job.printing.image, imageFile(id))) {
        index[id] = job.printing.image;
        report[job.replaced ? 'replaced' : 'downloaded'] += 1;
        if ((report.downloaded + report.replaced) % 1000 === 0) {
          console.error(`Downloaded ${report.downloaded + report.replaced} of ${jobs.length} images.`);
          await writeFile(indexPath, JSON.stringify(index));
        }
      } else {
        report.failed.push(job.printing.image);
      }
    }
  }
  await Promise.all(Array.from({ length: downloadConcurrency }, worker));
  await writeFile(indexPath, JSON.stringify(index));
  return { cache: { directory, imageFile }, report };
}
