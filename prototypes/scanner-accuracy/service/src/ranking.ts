import type { Candidate, Evidence, Strategy } from "@scanner-accuracy/shared";
export type CorpusCard = Omit<Candidate, "confidence" | "evidence"> & {
  imageHash: string;
};
export type StrategyInput = {
  card: CorpusCard;
  imageScore: number;
  ocrScore?: number;
  ocrDetail: string;
};
function evidence(input: StrategyInput, ranking: Strategy): Evidence[] {
  return [
    {
      strategy: "image-distance",
      status: "available",
      score: input.imageScore,
      detail: "Best dHash similarity across the three normalized stills.",
    },
    ranking === "image-only"
      ? {
          strategy: "ocr",
          status: "unavailable",
          detail: "OCR is not used by the image-only ranking.",
        }
      : input.ocrScore === undefined
        ? { strategy: "ocr", status: "unavailable", detail: input.ocrDetail }
        : {
            strategy: "ocr",
            status: "available",
            score: input.ocrScore,
            detail: input.ocrDetail,
          },
    {
      strategy: "finish",
      status: "unavailable",
      detail: "Finish prediction is unavailable in this still-only baseline.",
    },
  ];
}
export function rankStrategy(
  strategy: Strategy,
  inputs: StrategyInput[],
): Candidate[] {
  if (strategy === "ocr-only" && inputs[0]?.ocrScore === undefined) return [];
  return inputs
    .map((input) => {
      const confidence =
        strategy === "image-only"
          ? input.imageScore
          : strategy === "ocr-only"
            ? input.ocrScore!
            : input.ocrScore === undefined
              ? input.imageScore
              : 0.85 * input.imageScore + 0.15 * input.ocrScore;
      return { ...input.card, confidence, evidence: evidence(input, strategy) };
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence || a.scryfallId.localeCompare(b.scryfallId),
    );
}
export function decideAbstention(
  candidates: Candidate[],
  unavailableReason?: string,
) {
  const first = candidates[0],
    second = candidates[1];
  const reasons: string[] = unavailableReason ? [unavailableReason] : [];
  if (!unavailableReason && (!first || first.confidence < 0.9))
    reasons.push("top confidence is below 0.90");
  if (
    !unavailableReason &&
    first &&
    second &&
    first.confidence - second.confidence < 0.08
  )
    reasons.push("top-two margin is below 0.08");
  return {
    abstained: reasons.length > 0,
    reasons,
    autoAcceptedScryfallId:
      reasons.length === 0 && first ? first.scryfallId : null,
  };
}
