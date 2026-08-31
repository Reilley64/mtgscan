import { describe, expect, it } from "vitest";
import { validateCorpusSelection } from "../src/outcomes.js";
import type { CorpusCard } from "../src/ranking.js";
const corpus: CorpusCard[] = [
  {
    scryfallId: "00000000-0000-4000-8000-000000000001",
    name: "Card",
    set: "tst",
    collectorNumber: "1",
    language: "en",
    finishes: ["nonfoil"],
    imageHash: "00",
  },
];
describe("outcome selections", () =>
  it("rejects a known finish absent from its corpus card", () => {
    expect(() =>
      validateCorpusSelection(corpus, {
        selectedScryfallId: corpus[0].scryfallId,
        language: "en",
        finish: "foil",
      }),
    ).toThrow("finish");
    expect(() =>
      validateCorpusSelection(corpus, {
        selectedScryfallId: corpus[0].scryfallId,
        language: "en",
        finish: "unknown",
      }),
    ).not.toThrow();
  }));
