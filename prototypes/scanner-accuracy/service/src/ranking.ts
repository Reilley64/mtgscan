import type { Candidate, Evidence } from "@scanner-accuracy/shared";

export type CorpusCard = Omit<Candidate, "confidence" | "evidence"> & {
  imageHash: string;
};
export type StrategyInput = {
  card: CorpusCard;
  imageScore: number;
  ocrScore?: number;
  ocrDetail: string;
};

export function fuseAndRank(inputs: StrategyInput[]): Candidate[] {
  return inputs
    .map(({ card, imageScore, ocrScore, ocrDetail }) => {
      const evidence: Evidence[] = [
        {
          strategy: "image-distance",
          status: "available",
          score: imageScore,
          detail: "Best dHash similarity across the three normalized stills.",
        },
        ocrScore === undefined
          ? { strategy: "ocr", status: "unavailable", detail: ocrDetail }
          : {
              strategy: "ocr",
              status: "available",
              score: ocrScore,
              detail: ocrDetail,
            },
        {
          strategy: "finish",
          status: "unavailable",
          detail:
            "Guided-tilt video is retained as evidence only; foil inference is not implemented.",
        },
      ];
      const confidence =
        ocrScore === undefined
          ? imageScore
          : 0.85 * imageScore + 0.15 * ocrScore;
      return { ...card, confidence, evidence };
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence || a.scryfallId.localeCompare(b.scryfallId),
    );
}

export function decideAbstention(candidates: Candidate[]): {
  abstained: boolean;
  reasons: string[];
  autoAcceptedScryfallId: string | null;
} {
  const first = candidates[0];
  const second = candidates[1];
  const reasons: string[] = [];
  if (!first || first.confidence < 0.9)
    reasons.push("top confidence is below 0.90");
  if (first && second && first.confidence - second.confidence < 0.08)
    reasons.push("top-two margin is below 0.08");
  return {
    abstained: reasons.length > 0,
    reasons,
    autoAcceptedScryfallId:
      reasons.length === 0 && first ? first.scryfallId : null,
  };
}
