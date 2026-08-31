import { describe, expect, it } from "vitest";
import { tokenSimilarity } from "../src/ocr.js";
describe("constrained OCR matching", () => {
  it("scores expected title tokens found in noisy text", () => {
    expect(tokenSimilarity("SOL RING 1 Artifact", "Sol Ring")).toBe(1);
    expect(tokenSimilarity("SOL artifact", "Sol Ring")).toBe(0.5);
  });
});
