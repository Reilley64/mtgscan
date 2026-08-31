import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { dataRoot } from "./config.js";
import { fetchCardMetadata } from "./corpus.js";
import {
  selectOwnedBenchmark,
  type OwnedVariant,
  type SelectionReport,
} from "./benchmark-selection.js";

export const personalManifestPath = path.join(
  dataRoot,
  "personal-kill-test-manifest.json",
);
export async function writePersonalManifest(
  csvPath: string,
  requestedSize = 40,
): Promise<{
  manifestFile: string;
  coverageFile: string;
  report: SelectionReport;
}> {
  if (
    !Number.isInteger(requestedSize) ||
    requestedSize < 30 ||
    requestedSize > 50
  )
    throw new Error("personal manifest size must be between 30 and 50");
  const records = parse(await fs.readFile(csvPath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const combined = new Map<string, OwnedVariant>();
  for (const row of records) {
    const scryfallId = row["Scryfall ID"]?.trim();
    if (!uuid.test(scryfallId)) continue;
    const rawFinish = row.Foil?.trim().toLowerCase();
    const finish =
      rawFinish === "normal"
        ? "nonfoil"
        : rawFinish === "foil"
          ? "foil"
          : rawFinish === "etched"
            ? "etched"
            : "unknown";
    const language = row.Language?.trim() || "en";
    const quantity = Math.max(0, Number.parseInt(row.Quantity ?? "0", 10) || 0);
    const key = `${scryfallId}|${language}|${finish}`;
    const existing = combined.get(key);
    combined.set(key, {
      name: row.Name?.trim() || scryfallId,
      scryfallId,
      language,
      finish,
      quantity: quantity + (existing?.quantity ?? 0),
    });
  }
  const owned = [...combined.values()].filter((row) => row.quantity > 0);
  const digest = crypto
    .createHash("sha256")
    .update(
      owned
        .map(
          (item) =>
            `${item.scryfallId}:${item.language}:${item.finish}:${item.quantity}`,
        )
        .sort()
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  const metadata = await fetchCardMetadata(
    owned.map((item) => item.scryfallId),
    `personal-owned-${digest}`,
  );
  const selected = selectOwnedBenchmark(owned, metadata, requestedSize);
  if (selected.manifest.entries.length < 30)
    throw new Error(
      `only ${selected.manifest.entries.length} eligible owned variants were found`,
    );
  await fs.mkdir(dataRoot, { recursive: true });
  const coverageFile = path.join(dataRoot, "personal-kill-test-coverage.json");
  await fs.writeFile(
    personalManifestPath,
    JSON.stringify(selected.manifest, null, 2),
  );
  await fs.writeFile(coverageFile, JSON.stringify(selected.report, null, 2));
  return {
    manifestFile: personalManifestPath,
    coverageFile,
    report: selected.report,
  };
}
