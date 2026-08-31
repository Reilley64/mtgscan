import { describe, expect, it } from "vitest";
import type { Outcome } from "@scanner-accuracy/shared";
import { aggregateReport } from "../src/metrics.js";
import type { CorpusCard } from "../src/ranking.js";
const ids = {
  exact: "00000000-0000-4000-8000-000000000001",
  otherPrint: "00000000-0000-4000-8000-000000000002",
  wrong: "00000000-0000-4000-8000-000000000003",
  oracle: "10000000-0000-4000-8000-000000000001",
};
const corpus: CorpusCard[] = [ids.exact, ids.otherPrint, ids.wrong].map(
  (id, index) => ({
    scryfallId: id,
    oracleId: index < 2 ? ids.oracle : "10000000-0000-4000-8000-000000000002",
    name: index < 2 ? "Same card" : "Wrong",
    set: "tst",
    collectorNumber: String(index),
    language: "en",
    finishes: ["nonfoil"],
    imageHash: "00",
  }),
);
const outcome = (
  top: string,
  auto: string | null,
  latencyMs: number,
  finish: "nonfoil" | "foil" = "nonfoil",
): Outcome => ({
  sessionId: "s",
  scanId: crypto.randomUUID(),
  scanStartedAt: "2026-01-01T00:00:00.000Z",
  scanCompletedAt: "2026-01-01T00:00:30.000Z",
  correction: {
    selectedScryfallId: ids.exact,
    language: "en",
    finish,
    changedFromProposal: true,
  },
  groundTruth: {
    selectedScryfallId: ids.exact,
    language: "en",
    finish: "nonfoil",
  },
  recognition: {
    sessionId: "s",
    scanId: "x",
    latencyMs,
    candidates: [top, ids.exact].map((id) => ({
      ...corpus.find((card) => card.scryfallId === id)!,
      confidence: 0.9,
      evidence: [],
    })),
    abstention: { abstained: false, reasons: [] },
    autoAcceptedScryfallId: auto,
  },
});
describe("report aggregation", () => {
  it("separates identity from printing and calculates risk, latency, throughput, corrections, and leaves unsupported finish classification unavailable", () => {
    const report = aggregateReport(
      [
        outcome(ids.otherPrint, ids.otherPrint, 100),
        outcome(ids.exact, ids.exact, 500, "foil"),
      ],
      corpus,
    );
    expect(report).toMatchObject({
      scans: 2,
      identityTop1: 1,
      exactPrintingAccuracy: 0.5,
      falseAutoAcceptRate: 0.5,
      autoAcceptCoverage: 1,
      correctionRate: 1,
      finishAccuracy: null,
      finishCoverage: 0,
      finishConfusion: null,
    });
    expect(report.latencyMs).toEqual({ p50: 100, p95: 500 });
    expect(report.cardsPerMinute).toBe(4);
    expect(report.duplicateDetection).toBe("unavailable");
  });
});
