import type { Outcome, Report, Strategy } from "@scanner-accuracy/shared";
import type { CorpusCard } from "./ranking.js";
function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? null;
}
const sameIdentity = (
  left: { scryfallId: string; oracleId?: string },
  right: { scryfallId: string; oracleId?: string },
) =>
  left.oracleId && right.oracleId
    ? left.oracleId === right.oracleId
    : left.scryfallId === right.scryfallId;
export function aggregateReport(
  outcomes: Outcome[],
  corpus: CorpusCard[],
): Report {
  const byId = new Map(corpus.map((card) => [card.scryfallId, card]));
  const scored = outcomes.filter((o) => o.groundTruth);
  const strategies = ["image-only", "ocr-only", "hybrid"] as Strategy[];
  const strategyMetrics = Object.fromEntries(
    strategies.map((strategy) => {
      let top1 = 0,
        top3 = 0,
        printing = 0,
        language = 0,
        auto = 0,
        falseAuto = 0,
        corrections = 0;
      for (const outcome of scored) {
        const truth = outcome.groundTruth!,
          truthCard = byId.get(truth.selectedScryfallId),
          result = outcome.recognition.results.find(
            (item) => item.strategy === strategy,
          ),
          first = result?.candidates[0];
        if (
          !result?.abstention.abstained &&
          first &&
          truthCard &&
          sameIdentity(first, truthCard)
        )
          top1++;
        if (
          truthCard &&
          result?.candidates
            .slice(0, 3)
            .some((candidate) => sameIdentity(candidate, truthCard))
        )
          top3++;
        if (
          !result?.abstention.abstained &&
          first?.scryfallId === truth.selectedScryfallId
        )
          printing++;
        if (!result?.abstention.abstained && first?.language === truth.language)
          language++;
        if (result?.autoAcceptedScryfallId) {
          auto++;
          if (
            result.autoAcceptedScryfallId !== truth.selectedScryfallId ||
            first?.language !== truth.language
          )
            falseAuto++;
        }
        if (
          first &&
          (outcome.correction.selectedScryfallId !== first.scryfallId ||
            outcome.correction.language !== first.language ||
            outcome.correction.finish !== "unknown")
        )
          corrections++;
      }
      return [
        strategy,
        {
          identityTop1: scored.length ? top1 / scored.length : null,
          identityTop3: scored.length ? top3 / scored.length : null,
          scryfallPrintingAccuracy: scored.length
            ? printing / scored.length
            : null,
          languageAccuracy: scored.length ? language / scored.length : null,
          falseAutoAcceptRate: auto ? falseAuto / auto : null,
          falseAutoAcceptsPerThousandPresentations: scored.length
            ? (falseAuto * 1000) / scored.length
            : null,
          autoAcceptCoverage: scored.length ? auto / scored.length : null,
          correctionRate: scored.length ? corrections / scored.length : null,
        },
      ];
    }),
  ) as Report["strategies"];
  const timed = outcomes
    .map((o) => ({
      start: Date.parse(o.scanStartedAt),
      end: Date.parse(o.scanCompletedAt),
      session: o.sessionId,
    }))
    .filter(
      (x) =>
        Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start,
    );
  const spans = new Map<
    string,
    { start: number; end: number; count: number }
  >();
  for (const item of timed) {
    const span = spans.get(item.session) ?? {
      start: item.start,
      end: item.end,
      count: 0,
    };
    span.start = Math.min(span.start, item.start);
    span.end = Math.max(span.end, item.end);
    span.count++;
    spans.set(item.session, span);
  }
  const elapsed = [...spans.values()].reduce(
    (sum, s) => sum + s.end - s.start,
    0,
  );
  return {
    scans: outcomes.length,
    strategies: strategyMetrics,
    latencyMs: {
      service: {
        p50: percentile(
          outcomes.map((o) => o.recognition.serviceLatencyMs),
          0.5,
        ),
        p95: percentile(
          outcomes.map((o) => o.recognition.serviceLatencyMs),
          0.95,
        ),
      },
      endToEndProposal: {
        p50: percentile(
          outcomes.map((o) => o.endToEndProposalLatencyMs),
          0.5,
        ),
        p95: percentile(
          outcomes.map((o) => o.endToEndProposalLatencyMs),
          0.95,
        ),
      },
    },
    cardsPerMinute: elapsed > 0 ? (timed.length * 60000) / elapsed : null,
    duplicateDetection: "unavailable",
    missedChangeDetection: "unavailable",
    finishAccuracy: "unavailable",
    physicalVariantAccuracy: "unavailable",
    notes: [
      "Identity compares oracle IDs only when both candidates provide one; otherwise it compares Scryfall printing IDs.",
      "Each strategy ranks the same three stills. OCR-only abstains when OCR is unavailable; abstentions fail top-1 metrics but not top-3 recall.",
      "Finish and physical-variant accuracy are unavailable because this prototype does not predict finish. Correction rate includes any required printing, language, or finish edit.",
      "Cards/minute sums each session span, so gaps between sessions are excluded.",
    ],
  };
}
