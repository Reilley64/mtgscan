import fs from "node:fs/promises";
import path from "node:path";
import {
  BenchmarkManifestSchema,
  type BenchmarkManifest,
} from "@scanner-accuracy/shared";
import { dataRoot } from "./config.js";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { differenceHash } from "./image-distance.js";
import type { CorpusCard } from "./ranking.js";

const headers = {
  "User-Agent":
    "mtgscan-scanner-prototype/0.1 (local research harness; contact: repository owner)",
  Accept: "application/json",
};
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
async function fetchBounded(
  url: string,
  options: RequestInit = {},
  maximumBytes = 20_000_000,
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(`Scryfall ${response.status} for ${url}`);
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maximumBytes)
        throw new Error(`response exceeds ${maximumBytes} bytes`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maximumBytes)
        throw new Error(`response exceeds ${maximumBytes} bytes`);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(500);
    }
  }
  throw lastError;
}
async function cached(
  url: string,
  file: string,
  options?: RequestInit,
  max?: number,
): Promise<Buffer> {
  try {
    return await fs.readFile(file);
  } catch {
    /* cache miss */
  }
  const value = await fetchBounded(url, options, max);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value);
  return value;
}
export async function loadManifest(
  manifestPath: string,
): Promise<BenchmarkManifest> {
  return BenchmarkManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")),
  );
}

export async function fetchCardMetadata(
  scryfallIds: string[],
  cachePrefix: string,
): Promise<any[]> {
  const uniqueIds = [...new Set(scryfallIds)].sort();
  const cards: any[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 75) {
    const chunk = uniqueIds.slice(offset, offset + 75);
    const metadataFile = path.join(
      dataRoot,
      "scryfall",
      `${cachePrefix}-${String(offset / 75).padStart(2, "0")}.json`,
    );
    const metadataBuffer = await cached(
      "https://api.scryfall.com/cards/collection",
      metadataFile,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
      },
      12_000_000,
    );
    const response = JSON.parse(metadataBuffer.toString("utf8")) as {
      data?: any[];
      not_found?: unknown[];
    };
    if (!response.data || response.data.length !== chunk.length)
      throw new Error(
        `Scryfall returned ${response.data?.length ?? 0}/${chunk.length} cards; not found: ${JSON.stringify(response.not_found ?? [])}`,
      );
    cards.push(...response.data);
    await wait(100);
  }
  return cards;
}

export async function prepareCorpus(
  manifestPath: string,
): Promise<{ cards: CorpusCard[]; manifest: string }> {
  const manifest = await loadManifest(manifestPath);
  const cacheRoot = path.join(dataRoot, "scryfall");
  const uniqueEntries = [
    ...new Map(
      manifest.entries.map((entry) => [entry.scryfallId, entry]),
    ).values(),
  ];
  const response = await fetchCardMetadata(
    uniqueEntries.map((entry) => entry.scryfallId),
    `collection-${manifest.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
  );
  const metadata = new Map(response.map((card) => [card.id as string, card]));
  const cards: CorpusCard[] = [];
  for (const entry of uniqueEntries) {
    const card = metadata.get(entry.scryfallId);
    const imageUrl =
      card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
    if (!card || !imageUrl)
      throw new Error(
        `No Scryfall reference image for ${entry.name} (${entry.scryfallId})`,
      );
    const referenceFile = path.join(
      cacheRoot,
      "images",
      `${entry.scryfallId}.jpg`,
    );
    const reference = await cached(
      imageUrl,
      referenceFile,
      { headers: { Accept: "image/jpeg,image/*" } },
      20_000_000,
    );
    cards.push({
      scryfallId: card.id,
      oracleId: card.oracle_id,
      name: card.name,
      set: card.set,
      collectorNumber: card.collector_number,
      language: card.lang,
      finishes: (card.finishes ?? ["unknown"]).filter((finish: string) =>
        ["nonfoil", "foil", "etched"].includes(finish),
      ),
      imageHash: await differenceHash(reference),
    });
    await wait(100);
  }
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(
    path.join(dataRoot, "corpus.json"),
    JSON.stringify(cards, null, 2),
  );
  return { cards, manifest: manifest.name };
}
export async function loadCorpus(): Promise<CorpusCard[]> {
  return JSON.parse(
    await fs.readFile(path.join(dataRoot, "corpus.json"), "utf8"),
  ) as CorpusCard[];
}

export async function cacheDefaultCardsBulkMetadata(): Promise<string> {
  const index = JSON.parse(
    (
      await fetchBounded("https://api.scryfall.com/bulk-data", {}, 2_000_000)
    ).toString("utf8"),
  ) as { data: Array<{ type: string; download_uri: string }> };
  const source = index.data.find((entry) => entry.type === "default_cards");
  if (!source) throw new Error("Scryfall default_cards bulk source not found");
  const target = path.join(dataRoot, "scryfall", "default-cards.json");
  try {
    await fs.access(target);
    return target;
  } catch {
    /* cache miss */
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(source.download_uri, {
    headers,
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body)
    throw new Error(
      `Scryfall ${response.status} for default_cards bulk download`,
    );
  const temporary = `${target}.partial`;
  let bytes = 0;
  const bound = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > 2_000_000_000 ? new Error("bulk response exceeds 2 GB") : null,
        chunk,
      );
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      bound,
      (await import("node:fs")).createWriteStream(temporary),
    );
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return target;
}
