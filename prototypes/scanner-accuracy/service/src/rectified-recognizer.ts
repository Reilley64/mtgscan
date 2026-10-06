import type { CardQuad } from "./rectify.js";
import { rectifiedCropJpeg, rectifyCard } from "./rectify.js";
import { rankByAppearance } from "./rectified-ranking.js";
import { grayscale } from "./rectified-features.js";
import type { RectifiedCorpus } from "./rectified-corpus.js";
import type { RectifiedRerankRunner } from "./rectified-rerank-runner.js";
import {
  decideRectifiedAcceptance,
  verifiedScore,
} from "./rectified-decision.js";

export const APPEARANCE_SHORTLIST = 8;
export const LEADING_IDENTITIES = 3;
export const RERANK_LIMIT = 24;

export type RectifiedRecognition = {
  scanId: string;
  serviceLatencyMs: number;
  stageMs: { decode: number; rectify: number; rank: number; rerank: number };
  candidates: Array<{
    scryfallId: string;
    oracleId: string;
    name: string;
    set: string;
    collectorNumber: string;
    score: number;
  }>;
  decision: { accepted: boolean; scryfallId: string | null; reasons: string[] };
};

export async function recognizeRectified(
  input: { scanId: string; photo: Buffer; quad: CardQuad },
  corpus: RectifiedCorpus,
  runner: RectifiedRerankRunner,
): Promise<{ recognition: RectifiedRecognition; crop: Buffer }> {
  const started = performance.now();
  const image = await rectifyCard(input.photo, input.quad);
  const rankStarted = performance.now();
  const appearance = rankByAppearance(image, corpus.appearance);
  const order = [...appearance.keys()].sort(
    (a, b) => appearance[b]! - appearance[a]!,
  );
  const selected = new Set(order.slice(0, APPEARANCE_SHORTLIST));
  const leadingIdentities = new Set(
    order
      .slice(0, LEADING_IDENTITIES)
      .map((index) => corpus.cards[index]!.oracleId),
  );
  for (const index of order)
    if (
      selected.size < RERANK_LIMIT &&
      leadingIdentities.has(corpus.cards[index]!.oracleId)
    )
      selected.add(index);
  const rerankStarted = performance.now();
  const reranked = await runner.rerank({
    gray: grayscale(image.rgb),
    width: image.width,
    height: image.height,
    cardWindow: image.card,
    scryfallIds: [...selected].map((index) => corpus.cards[index]!.scryfallId),
  });
  const rerankFinished = performance.now();
  const positions = new Map(
    corpus.cards.map((card, index) => [card.scryfallId, index]),
  );
  const ranked = reranked.evidence
    .map((evidence) => ({
      ...evidence,
      appearance: appearance[positions.get(evidence.scryfallId)!]!,
    }))
    .sort(
      (a, b) =>
        verifiedScore(b) - verifiedScore(a) ||
        b.appearance - a.appearance ||
        a.scryfallId.localeCompare(b.scryfallId),
    );
  const decision = decideRectifiedAcceptance(ranked);
  const crop = await rectifiedCropJpeg(image);
  return {
    crop,
    recognition: {
      scanId: input.scanId,
      serviceLatencyMs: Math.round(performance.now() - started),
      stageMs: {
        decode: Math.round(image.decodeMs),
        rectify: Math.round(image.rectifyMs),
        rank: Math.round(rerankStarted - rankStarted),
        rerank: Math.round(rerankFinished - rerankStarted),
      },
      candidates: ranked.slice(0, 5).map((candidate) => {
        const card = corpus.cards[positions.get(candidate.scryfallId)!]!;
        return {
          scryfallId: card.scryfallId,
          oracleId: card.oracleId,
          name: card.name,
          set: card.set,
          collectorNumber: card.collectorNumber,
          score: verifiedScore(candidate),
        };
      }),
      decision,
    },
  };
}
