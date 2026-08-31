import { describe, expect, it } from "vitest";
import type { Outcome } from "@scanner-accuracy/shared";
import { aggregateReport } from "../src/metrics.js";
import type { CorpusCard } from "../src/ranking.js";
const exact = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  oracle = "10000000-0000-4000-8000-000000000001";
const corpus: CorpusCard[] = [exact, other].map((scryfallId, index) => ({
  scryfallId,
  oracleId: index ? undefined : oracle,
  name: "Card",
  set: "tst",
  collectorNumber: String(index),
  language: "en",
  finishes: ["nonfoil"],
  imageHash: "00",
}));
const result = (
  strategy: "image-only" | "ocr-only" | "hybrid",
  id: string,
) => ({
  strategy,
  candidates: [
    {
      ...corpus.find((card) => card.scryfallId === id)!,
      confidence: 1,
      evidence: [],
    },
  ],
  abstention: { abstained: false, reasons: [] },
  autoAcceptedScryfallId: id,
});
const outcome: Outcome = {
  sessionId: "one",
  scanId: "scan",
  scanStartedAt: "2025-01-01T00:00:00.000Z",
  scanCompletedAt: "2025-01-01T00:00:01.000Z",
  endToEndProposalLatencyMs: 20,
  recognition: {
    sessionId: "one",
    scanId: "scan",
    serviceLatencyMs: 10,
    results: [
      result("image-only", exact),
      result("ocr-only", other),
      result("hybrid", exact),
    ],
  },
  correction: {
    selectedScryfallId: exact,
    language: "en",
    finish: "nonfoil",
    changedFromProposal: true,
  },
  groundTruth: { selectedScryfallId: exact, language: "en", finish: "nonfoil" },
};
describe("metrics", () =>
  it("reports strategies and does not equate missing oracle IDs", () => {
    const report = aggregateReport([outcome], corpus);
    expect(report.strategies["image-only"].scryfallPrintingAccuracy).toBe(1);
    expect(report.strategies["ocr-only"].identityTop1).toBe(0);
    expect(report.strategies["image-only"].correctionRate).toBe(1);
    expect(report.finishAccuracy).toBe("unavailable");
  }));

describe("abstentions and language", () => {
  it("counts abstained top candidates as top-1 failures and wrong-language auto-accepts as false", () => {
    const copy = structuredClone(outcome);
    copy.recognition.results[0]!.abstention.abstained = true;
    copy.recognition.results[0]!.candidates[0]!.language = "fr";
    const report = aggregateReport([copy], corpus);
    expect(report.strategies["image-only"].identityTop1).toBe(0);
    expect(report.strategies["image-only"].scryfallPrintingAccuracy).toBe(0);
    expect(report.strategies["image-only"].languageAccuracy).toBe(0);
    expect(report.strategies["image-only"].falseAutoAcceptRate).toBe(1);
    expect(
      report.strategies["image-only"].falseAutoAcceptsPerThousandPresentations,
    ).toBe(1000);
  });
});
