import { describe, expect, it } from "vitest";
import {
  selectOwnedBenchmark,
  type OwnedVariant,
  type ScryfallSelectionCard,
} from "../src/benchmark-selection.js";
const metadata: ScryfallSelectionCard[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    oracle_id: "10000000-0000-4000-8000-000000000001",
    name: "Shared",
    set: "old",
    collector_number: "1",
    lang: "en",
    released_at: "2010-01-01",
    frame: "1997",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    oracle_id: "10000000-0000-4000-8000-000000000001",
    name: "Shared",
    set: "new",
    collector_number: "1a",
    lang: "en",
    released_at: "2025-01-01",
    frame_effects: ["showcase"],
    layout: "transform",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    oracle_id: "10000000-0000-4000-8000-000000000003",
    name: "Control",
    set: "new",
    collector_number: "3",
    lang: "en",
  },
];
const owned: OwnedVariant[] = [
  {
    name: "Shared",
    scryfallId: metadata[0]!.id,
    language: "en",
    finish: "nonfoil",
    quantity: 1,
  },
  {
    name: "Shared",
    scryfallId: metadata[1]!.id,
    language: "en",
    finish: "nonfoil",
    quantity: 1,
  },
  {
    name: "Shared",
    scryfallId: metadata[1]!.id,
    language: "en",
    finish: "foil",
    quantity: 1,
  },
  {
    name: "Control",
    scryfallId: metadata[2]!.id,
    language: "ja",
    finish: "nonfoil",
    quantity: 1,
  },
];
describe("owned benchmark selection", () => {
  it("is reproducible, never exceeds owned variants, and reports missing strata", () => {
    const first = selectOwnedBenchmark(owned, metadata, 4);
    const second = selectOwnedBenchmark([...owned].reverse(), metadata, 4);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.entries).toHaveLength(4);
    expect(
      first.manifest.entries.filter(
        (entry) => entry.scryfallId === metadata[1]!.id,
      ),
    ).toHaveLength(2);
    expect(first.report.categories["non-English"].gap).toBeGreaterThan(0);
    expect(
      first.manifest.entries.every(
        (entry) => !Object.hasOwn(entry, "purchasePrice"),
      ),
    ).toBe(true);
  });
});
