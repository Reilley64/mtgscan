import type { Outcome, Report } from "@scanner-accuracy/shared";
import type { CorpusCard } from "./ranking.js";

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? null;
}

export function aggregateReport(
  outcomes: Outcome[],
  corpus: CorpusCard[],
): Report {
  const byId = new Map(corpus.map((card) => [card.scryfallId, card]));
  const scored = outcomes.filter((outcome) => outcome.groundTruth);
  let top1 = 0,
    top3 = 0,
    exact = 0,
    falseAccepts = 0,
    autoAccepts = 0,
    corrections = 0;
  for (const outcome of scored) {
    const truth = outcome.groundTruth!;
    const truthCard = byId.get(truth.selectedScryfallId);
    const first = outcome.recognition.candidates[0];
    if (
      !outcome.recognition.abstention.abstained &&
      first?.scryfallId === truth.selectedScryfallId
    )
      exact++;
    if (
      !outcome.recognition.abstention.abstained &&
      truthCard &&
      first?.oracleId === truthCard.oracleId
    )
      top1++;
    if (
      truthCard &&
      outcome.recognition.candidates
        .slice(0, 3)
        .some((candidate) => candidate.oracleId === truthCard.oracleId)
    )
      top3++;
    if (outcome.recognition.autoAcceptedScryfallId) {
      autoAccepts++;
      if (
        outcome.recognition.autoAcceptedScryfallId !== truth.selectedScryfallId
      )
        falseAccepts++;
    }
    if (outcome.correction.changedFromProposal) corrections++;
  }
  const finishScored = scored.filter(
    (outcome) => outcome.groundTruth?.finish !== "unknown",
  );
  const timed = outcomes
    .map((outcome) => ({
      start: Date.parse(outcome.scanStartedAt),
      end: Date.parse(outcome.scanCompletedAt),
    }))
    .filter(
      ({ start, end }) =>
        Number.isFinite(start) && Number.isFinite(end) && end >= start,
    );
  const elapsed = timed.length
    ? Math.max(...timed.map((item) => item.end)) -
      Math.min(...timed.map((item) => item.start))
    : 0;
  return {
    scans: outcomes.length,
    identityTop1: scored.length ? top1 / scored.length : null,
    identityTop3: scored.length ? top3 / scored.length : null,
    exactPrintingAccuracy: scored.length ? exact / scored.length : null,
    falseAutoAcceptRate: autoAccepts ? falseAccepts / autoAccepts : null,
    autoAcceptCoverage: scored.length ? autoAccepts / scored.length : null,
    correctionRate: scored.length ? corrections / scored.length : null,
    latencyMs: {
      p50: percentile(
        outcomes.map((item) => item.recognition.latencyMs),
        0.5,
      ),
      p95: percentile(
        outcomes.map((item) => item.recognition.latencyMs),
        0.95,
      ),
    },
    cardsPerMinute: elapsed > 0 ? (timed.length * 60_000) / elapsed : null,
    duplicateDetection: "unavailable",
    missedChangeDetection: "unavailable",
    finishAccuracy: null,
    finishCoverage: finishScored.length ? 0 : null,
    finishConfusion: null,
    notes: [
      "Identity uses shared oracleId; exact printing uses Scryfall printing ID.",
      "Duplicate and missed-change detection are not implemented in this phase.",
      "Finish classification is not implemented. With finish ground truth, coverage is 0 and accuracy/confusion remain unavailable.",
    ],
  };
}
