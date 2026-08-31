import { describe, expect, it } from "vitest";
import {
  decideAbstention,
  rankStrategy,
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
const inputs = [
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
];
describe("separate ranking strategies", () => {
  it("ranks each explicit strategy", () => {
    expect(rankStrategy("image-only", inputs)[0]?.name).toBe("Beta");
    expect(rankStrategy("ocr-only", inputs)[0]?.name).toBe("Alpha");
    expect(rankStrategy("hybrid", inputs)[0]?.name).toBe("Alpha");
  });
  it("falls back to image-only hybrid confidence when OCR is unavailable", () => {
    const [candidate] = rankStrategy(
      "hybrid",
      inputs.map((item) => ({ ...item, ocrScore: undefined })),
    );
    expect(candidate?.confidence).toBe(0.92);
    expect(
      candidate?.evidence.find((item) => item.strategy === "ocr")?.status,
    ).toBe("unavailable");
  });
  it("makes unavailable OCR abstain rather than fabricate scores", () => {
    const ranked = rankStrategy(
      "ocr-only",
      inputs.map((item) => ({ ...item, ocrScore: undefined })),
    );
    expect(ranked).toEqual([]);
    expect(decideAbstention(ranked, "OCR disabled").abstained).toBe(true);
  });
});
