import { describe, expect, it } from "vitest";
import {
  decideAbstention,
  fuseAndRank,
  type CorpusCard,
} from "../src/ranking.js";
const card = (id: string, name: string): CorpusCard => ({
  scryfallId: id,
  oracleId: "10000000-0000-4000-8000-000000000000",
  name,
  set: "tst",
  collectorNumber: "1",
  language: "en",
  finishes: ["nonfoil"],
  imageHash: "00",
});
describe("evidence fusion and ranking", () => {
  it("uses deterministic image evidence and optional OCR without inventing finish evidence", () => {
    const ranked = fuseAndRank([
      {
        card: card("00000000-0000-4000-8000-000000000001", "Alpha"),
        imageScore: 0.9,
        ocrScore: 1,
        ocrDetail: "alpha",
      },
      {
        card: card("00000000-0000-4000-8000-000000000002", "Beta"),
        imageScore: 0.92,
        ocrScore: 0,
        ocrDetail: "alpha",
      },
    ]);
    expect(ranked[0]?.name).toBe("Alpha");
    expect(ranked[0]?.confidence).toBeCloseTo(0.915);
    expect(ranked[0]?.evidence.at(-1)?.status).toBe("unavailable");
  });
});
describe("abstention", () => {
  it("auto-accepts only a high score with a clear margin", () => {
    const ranked = fuseAndRank([
      {
        card: card("00000000-0000-4000-8000-000000000001", "Alpha"),
        imageScore: 0.96,
        ocrDetail: "off",
      },
      {
        card: card("00000000-0000-4000-8000-000000000002", "Beta"),
        imageScore: 0.84,
        ocrDetail: "off",
      },
    ]);
    expect(decideAbstention(ranked)).toMatchObject({
      abstained: false,
      autoAcceptedScryfallId: ranked[0]?.scryfallId,
    });
  });
  it("abstains on an ambiguous margin", () => {
    const ranked = fuseAndRank([
      {
        card: card("00000000-0000-4000-8000-000000000001", "Alpha"),
        imageScore: 0.96,
        ocrDetail: "off",
      },
      {
        card: card("00000000-0000-4000-8000-000000000002", "Beta"),
        imageScore: 0.91,
        ocrDetail: "off",
      },
    ]);
    expect(decideAbstention(ranked).abstained).toBe(true);
  });
});
