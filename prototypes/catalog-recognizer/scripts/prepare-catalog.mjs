import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.resolve(process.env.CATALOG_DATA_DIR ?? path.join(projectRoot, ".data"));
const catalogDirectory = path.join(dataRoot, "catalog");
const imagesDirectory = path.join(dataRoot, "images");
const userAgent = "mtgscan-prototype/0.1 (catalog recognizer)";
const excludedLayouts = new Set([
  "token",
  "art_series",
  "emblem",
  "double_faced_token",
  "front_card",
  "vanguard",
  "planar",
  "scheme",
]);
const downloadConcurrency = 8;

async function bulkFile() {
  if (process.env.SCRYFALL_BULK_FILE) return path.resolve(process.env.SCRYFALL_BULK_FILE);
  const response = await fetch("https://api.scryfall.com/bulk-data/default-cards", {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`bulk-data lookup failed: ${response.status}`);
  const { download_uri: uri } = await response.json();
  const file = path.join(dataRoot, path.basename(new URL(uri).pathname));
  if (!existsSync(file)) {
    const download = await fetch(uri, { headers: { "User-Agent": userAgent } });
    if (!download.ok) throw new Error(`bulk download failed: ${download.status}`);
    await fs.writeFile(`${file}.tmp`, Buffer.from(await download.arrayBuffer()));
    await fs.rename(`${file}.tmp`, file);
  }
  return file;
}

async function* bulkCards(file) {
  const input = createReadStream(file);
  const stream = file.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input;
  for await (const raw of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
    const line = raw.trim().replace(/,$/, "");
    if (!line || line === "[" || line === "]") continue;
    yield JSON.parse(line);
  }
}

function catalogEntry(card) {
  const face = card.card_faces?.[0];
  const image = card.image_uris?.normal ?? face?.image_uris?.normal;
  const oracleId = card.oracle_id ?? face?.oracle_id;
  if (!image || !oracleId) return null;
  return {
    entry: {
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
      const job = jobs[next++];
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt++) {
        try {
          const response = await fetch(job.url, { headers: { "User-Agent": userAgent, Accept: "image/*" } });
          if (response.ok) {
            await fs.writeFile(`${job.file}.tmp`, Buffer.from(await response.arrayBuffer()));
            await fs.rename(`${job.file}.tmp`, job.file);
            saved = true;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      }
      if (!saved) failures.push(job.url);
      completed += 1;
      if (completed % 1000 === 0) console.error(`downloaded ${completed} of ${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: downloadConcurrency }, worker));
  return failures;
}

await fs.mkdir(catalogDirectory, { recursive: true });
await fs.mkdir(imagesDirectory, { recursive: true });
const file = await bulkFile();
const entries = [];
const images = new Map();
for await (const card of bulkCards(file)) {
  if (!card.games?.includes("paper") || card.digital || excludedLayouts.has(card.layout)) continue;
  const result = catalogEntry(card);
  if (!result) continue;
  entries.push(result.entry);
  images.set(result.entry.id, result.image);
}
entries.sort((a, b) => a.id.localeCompare(b.id));
await fs.writeFile(path.join(catalogDirectory, "catalog.json"), JSON.stringify(entries));
const existing = new Set(await fs.readdir(imagesDirectory));
const jobs = entries
  .filter((entry) => !existing.has(`${entry.id}.jpg`))
  .map((entry) => ({ url: images.get(entry.id), file: path.join(imagesDirectory, `${entry.id}.jpg`) }));
console.error(`catalog has ${entries.length} printings from ${path.basename(file)}; ${jobs.length} images to download`);
const failures = await download(jobs);
if (failures.length) {
  console.error(`${failures.length} downloads failed, first: ${failures.slice(0, 3).join(", ")}`);
  process.exit(1);
}
const helper = process.env.CATALOG_RECOGNIZER_BIN ?? path.join(projectRoot, ".build", "mtg-catalog-recognizer");
const result = spawnSync(helper, ["index", catalogDirectory, imagesDirectory], { stdio: "inherit" });
process.exit(result.status ?? 1);
