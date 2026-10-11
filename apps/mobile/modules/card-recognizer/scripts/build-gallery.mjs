import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';

import { buildRecognizer, dataDirectory, galleryDirectory, printingListFile, run } from './recognizer-command.mjs';

const imagesDirectory = path.join(dataDirectory, 'images');
const userAgent = 'mtgscan/0.1 (gallery build)';
const excludedLayouts = new Set([
  'token',
  'art_series',
  'emblem',
  'double_faced_token',
  'front_card',
  'vanguard',
  'planar',
  'scheme',
]);
const downloadConcurrency = 8;

async function bulkFile() {
  if (process.env.SCRYFALL_BULK_FILE) return path.resolve(process.env.SCRYFALL_BULK_FILE);
  const response = await fetch('https://api.scryfall.com/bulk-data/default-cards', {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`the bulk data lookup failed with ${response.status}`);
  const { jsonl_download_uri: uri } = await response.json();
  const file = path.join(dataDirectory, path.basename(new URL(uri).pathname));
  if (!existsSync(file)) {
    const download = await fetch(uri, { headers: { 'User-Agent': userAgent } });
    if (!download.ok) throw new Error(`the bulk data download failed with ${download.status}`);
    await fs.writeFile(`${file}.tmp`, Buffer.from(await download.arrayBuffer()));
    await fs.rename(`${file}.tmp`, file);
  }
  return file;
}

async function* bulkCards(file) {
  const input = createReadStream(file);
  const stream = file.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
  for await (const raw of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
    const line = raw.trim().replace(/,$/, '');
    if (!line || line === '[' || line === ']') continue;
    yield JSON.parse(line);
  }
}

function galleryRow(card) {
  const face = card.card_faces?.[0];
  const image = card.image_uris?.normal ?? face?.image_uris?.normal;
  const oracleId = card.oracle_id ?? face?.oracle_id;
  if (!image || !oracleId) return null;
  return {
    printing: {
      id: card.id,
      oracleId,
      illustrationId: card.illustration_id ?? face?.illustration_id ?? null,
      name: card.name,
      set: card.set,
      collectorNumber: card.collector_number,
      frame: card.frame,
    },
    image,
  };
}

async function download(jobs) {
  let next = 0;
  let completed = 0;
  const failures = [];
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
        try {
          const response = await fetch(job.url, { headers: { 'User-Agent': userAgent, Accept: 'image/*' } });
          if (response.ok) {
            await fs.writeFile(`${job.file}.tmp`, Buffer.from(await response.arrayBuffer()));
            await fs.rename(`${job.file}.tmp`, job.file);
            saved = true;
          }
        } catch {}
        if (!saved) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
      if (!saved) failures.push(job.url);
      completed += 1;
      if (completed % 5000 === 0) console.error(`downloaded ${completed} of ${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: downloadConcurrency }, worker));
  return failures;
}

await fs.mkdir(galleryDirectory, { recursive: true });
await fs.mkdir(imagesDirectory, { recursive: true });
const file = await bulkFile();
const printings = [];
const images = new Map();
for await (const card of bulkCards(file)) {
  if (!card.games?.includes('paper') || card.digital || excludedLayouts.has(card.layout)) continue;
  const row = galleryRow(card);
  if (!row) continue;
  printings.push(row.printing);
  images.set(row.printing.id, row.image);
}
printings.sort((a, b) => a.id.localeCompare(b.id));
await fs.writeFile(path.join(galleryDirectory, printingListFile), JSON.stringify(printings));
const existing = new Set(await fs.readdir(imagesDirectory));
const jobs = printings
  .filter((printing) => !existing.has(`${printing.id}.jpg`))
  .map((printing) => ({ url: images.get(printing.id), file: path.join(imagesDirectory, `${printing.id}.jpg`) }));
console.error(`${printings.length} printings from ${path.basename(file)}, ${jobs.length} images to download`);
const failures = await download(jobs);
if (failures.length > 0) {
  console.error(`${failures.length} downloads failed, first: ${failures.slice(0, 3).join(', ')}`);
  process.exit(1);
}
const recognizer = await buildRecognizer();
process.exit((await run(recognizer, ['index', galleryDirectory, imagesDirectory])).code ?? 1);
