import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import sharp from "sharp";
import { dataRoot, prototypeRoot } from "./config.js";
import { cached, fetchCardMetadata } from "./corpus.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./rectify.js";
import {
  appearanceDescriptors,
  DESCRIPTOR_LENGTH,
  EDGE_DESCRIPTOR_LENGTH,
  edgeDescriptors,
  type AppearanceReferences,
} from "./rectified-ranking.js";
import {
  buildPrintingGroup,
  loadPrintingIndex,
  writePrintingGroups,
  type PrintingGroup,
  type PrintingIndex,
} from "./rectified-printing.js";
import {
  grayscale,
  loadOpenCv,
  orbFeatures,
  REFERENCE_FEATURES,
} from "./rectified-features.js";

export const rectifiedRoot = path.join(dataRoot, "rectified");
export const referenceImageRoot = path.join(dataRoot, "scryfall", "images");
export const printingImageRoot = path.join(dataRoot, "scryfall", "png");
export const printingRoot = path.join(rectifiedRoot, "printing");

export type RectifiedCard = {
  scryfallId: string;
  oracleId: string;
  illustrationId: string | null;
  name: string;
  set: string;
  collectorNumber: string;
};
export type IndexedCard = RectifiedCard & {
  featureStart: number;
  featureCount: number;
};
export type RectifiedCorpusIndex = {
  createdAt: string;
  descriptorLength: number;
  edgeDescriptorLength: number;
  cards: IndexedCard[];
};
export type RectifiedCorpus = {
  cards: IndexedCard[];
  catalog: RectifiedCard[];
  appearance: AppearanceReferences;
  printing?: PrintingIndex;
};

export async function gatherRectifiedCards(options: {
  collectionCsv?: string;
  manifestPath?: string;
}): Promise<{
  cards: RectifiedCard[];
  pngUrls: Map<string, string>;
  collectionIds: number;
  searchedNames: number;
}> {
  const records = parse(
    await fs.readFile(
      options.collectionCsv ??
        path.resolve(prototypeRoot, "../../current_collection.csv"),
      "utf8",
    ),
    {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    },
  ) as Array<Record<string, string>>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const collectionIds = [
    ...new Set(
      records
        .map((row) => row["Scryfall ID"]?.trim() ?? "")
        .filter((id) => uuid.test(id)),
    ),
  ];
  const manifest = JSON.parse(
    await fs.readFile(
      options.manifestPath ??
        path.join(dataRoot, "personal-kill-test-manifest.json"),
      "utf8",
    ),
  ) as { entries: Array<{ name: string }> };
  const extraNames = await fs
    .readFile(path.join(dataRoot, "rectified", "extra-names.txt"), "utf8")
    .then(
      (text) =>
        text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      () => [],
    );
  const names = [
    ...new Set([...manifest.entries.map((entry) => entry.name), ...extraNames]),
  ].sort();
  const metadata = new Map<string, any>();
  for (const card of await fetchCardMetadata(
    collectionIds,
    "rectified-collection",
  ))
    metadata.set(card.id, card);
  for (const name of names) {
    const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    let url: string | null =
      `https://api.scryfall.com/cards/search?${new URLSearchParams({
        q: `!"${name}" unique:prints lang:en game:paper`,
        order: "released",
      })}`;
    for (let page = 1; url; page++) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const response = JSON.parse(
        (
          await cached(
            url,
            path.join(dataRoot, "scryfall", "search", `${slug}-${page}.json`),
            {},
            12_000_000,
          )
        ).toString("utf8"),
      ) as { data: any[]; has_more: boolean; next_page?: string };
      for (const card of response.data) metadata.set(card.id, card);
      url = response.has_more ? (response.next_page ?? null) : null;
    }
  }
  const cards: RectifiedCard[] = [];
  const pngUrls = new Map<string, string>();
  for (const card of [...metadata.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const face = card.card_faces?.[0];
    const imageUrl = card.image_uris?.normal ?? face?.image_uris?.normal;
    if (!imageUrl || card.digital) continue;
    const pngUrl = card.image_uris?.png ?? face?.image_uris?.png;
    if (pngUrl) pngUrls.set(card.id, pngUrl);
    await cached(
      imageUrl,
      path.join(referenceImageRoot, `${card.id}.jpg`),
      { headers: { Accept: "image/jpeg,image/*" } },
      20_000_000,
    );
    cards.push({
      scryfallId: card.id,
      oracleId: card.oracle_id ?? face?.oracle_id,
      illustrationId: card.illustration_id ?? face?.illustration_id ?? null,
      name: card.name,
      set: card.set,
      collectorNumber: card.collector_number,
    });
  }
  return {
    cards,
    pngUrls,
    collectionIds: collectionIds.length,
    searchedNames: names.length,
  };
}

export async function prepareRectifiedCorpus(
  options: { collectionCsv?: string; manifestPath?: string } = {},
) {
  const gathered = await gatherRectifiedCards(options);
  const cv = await loadOpenCv();
  const appearance = new Float32Array(
    gathered.cards.length * DESCRIPTOR_LENGTH,
  );
  const edge = new Float32Array(gathered.cards.length * EDGE_DESCRIPTOR_LENGTH);
  const points: Float32Array[] = [];
  const descriptors: Uint8Array[] = [];
  const cards: IndexedCard[] = [];
  let featureStart = 0;
  for (const [position, card] of gathered.cards.entries()) {
    const { data, info } = await sharp(
      await fs.readFile(
        path.join(referenceImageRoot, `${card.scryfallId}.jpg`),
      ),
    )
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const whole = { left: 0, top: 0, width: info.width, height: info.height };
    appearance.set(
      appearanceDescriptors(data, info.width, info.height, [whole])[0]!,
      position * DESCRIPTOR_LENGTH,
    );
    edge.set(
      edgeDescriptors(data, info.width, info.height, whole, [whole])[0]!,
      position * EDGE_DESCRIPTOR_LENGTH,
    );
    const features = orbFeatures(
      cv,
      grayscale(data),
      info.width,
      info.height,
      REFERENCE_FEATURES,
    );
    const featureCount = features.points.length / 2;
    points.push(features.points);
    descriptors.push(features.descriptors);
    cards.push({ ...card, featureStart, featureCount });
    featureStart += featureCount;
  }
  await fs.mkdir(rectifiedRoot, { recursive: true });
  await fs.writeFile(
    path.join(rectifiedRoot, "appearance.bin"),
    new Uint8Array(appearance.buffer),
  );
  await fs.writeFile(
    path.join(rectifiedRoot, "edge.bin"),
    new Uint8Array(edge.buffer),
  );
  await fs.writeFile(
    path.join(rectifiedRoot, "orb-points.bin"),
    Buffer.concat(points.map((chunk) => new Uint8Array(chunk.buffer))),
  );
  await fs.writeFile(
    path.join(rectifiedRoot, "orb-descriptors.bin"),
    Buffer.concat(descriptors),
  );
  await fs.writeFile(
    path.join(rectifiedRoot, "corpus.json"),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      descriptorLength: DESCRIPTOR_LENGTH,
      edgeDescriptorLength: EDGE_DESCRIPTOR_LENGTH,
      cards,
    } satisfies RectifiedCorpusIndex),
  );
  const printingStarted = performance.now();
  const byIllustration = new Map<string, RectifiedCard[]>();
  for (const card of gathered.cards)
    if (card.illustrationId && gathered.pngUrls.has(card.scryfallId))
      byIllustration.set(card.illustrationId, [
        ...(byIllustration.get(card.illustrationId) ?? []),
        card,
      ]);
  const groups: PrintingGroup[] = [];
  let printingImages = 0,
    downloaded = 0,
    clusters = 0,
    tiles = 0;
  for (const [illustrationId, members] of byIllustration) {
    if (members.length < 2) continue;
    const images = [];
    for (const member of members) {
      const file = path.join(printingImageRoot, `${member.scryfallId}.png`);
      const present = await fs.access(file).then(
        () => true,
        () => false,
      );
      images.push({
        scryfallId: member.scryfallId,
        image: await cached(
          gathered.pngUrls.get(member.scryfallId)!,
          file,
          { headers: { Accept: "image/png,image/*" } },
          20_000_000,
        ),
      });
      printingImages += 1;
      if (!present) downloaded += 1;
    }
    const built = await buildPrintingGroup(illustrationId, images);
    groups.push(built.group);
    clusters += built.clusters;
    tiles += built.tiles;
  }
  await writePrintingGroups(printingRoot, groups);
  return {
    cards: cards.length,
    printing: {
      groups: groups.length,
      images: printingImages,
      downloaded,
      clusters,
      markTiles: tiles,
      seconds: Math.round((performance.now() - printingStarted) / 1000),
    },
    collectionIds: gathered.collectionIds,
    searchedNames: gathered.searchedNames,
    names: new Set(cards.map((card) => card.oracleId)).size,
    referenceFeatures: featureStart,
  };
}

export async function loadRectifiedCorpus(
  root = rectifiedRoot,
): Promise<RectifiedCorpus> {
  const index = JSON.parse(
    await fs.readFile(path.join(root, "corpus.json"), "utf8"),
  ) as RectifiedCorpusIndex;
  if (
    index.descriptorLength !== DESCRIPTOR_LENGTH ||
    index.edgeDescriptorLength !== EDGE_DESCRIPTOR_LENGTH
  )
    throw new Error(
      "rectified corpus descriptors are stale; run rectified:prepare",
    );
  const floats = async (name: string) => {
    const bytes = await fs.readFile(path.join(root, name));
    return new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    );
  };
  return {
    cards: index.cards,
    catalog: index.cards,
    appearance: {
      color: await floats("appearance.bin"),
      edge: await floats("edge.bin"),
    },
    printing: await loadPrintingIndex(path.join(root, "printing")),
  };
}
