import type { CardQuad } from "./rectify.js";
import { rectifiedCropJpeg, rectifyCard, rotateHalfTurn } from "./rectify.js";
import { rankByAppearance } from "./rectified-ranking.js";
import { grayscale } from "./rectified-features.js";
import type { RectifiedCorpus } from "./rectified-corpus.js";
import type { RectifiedRerankRunner } from "./rectified-rerank-runner.js";
import {
  decideRectifiedAcceptance,
  verifiedScore,
} from "./rectified-decision.js";

export const COLOR_SHORTLIST = 8;
export const EDGE_SHORTLIST = 8;
export const LEADING_IDENTITIES = 3;
export const RERANK_LIMIT = 24;
export const ORIENTATION_MARGIN = 0.03;

export type RectifiedRecognition = {
  scanId: string;
  serviceLatencyMs: number;
  stageMs: { decode: number; rectify: number; rank: number; rerank: number };
  rotation: number;
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
) {
  const started = performance.now();
  const upright = await rectifyCard(input.photo, input.quad);
  const rankStarted = performance.now();
  const standardized = (values: Float32Array) => {
    let sum = 0,
      squares = 0;
    for (const value of values) {
      sum += value;
      squares += value * value;
    }
    const mean = sum / values.length;
    const deviation =
      Math.sqrt(Math.max(1e-12, squares / values.length - mean * mean)) || 1;
    return Float32Array.from(values, (value) => (value - mean) / deviation);
  };
  const views = [upright, rotateHalfTurn(upright)]
    .map((image) => {
      const scores = rankByAppearance(image, corpus.appearance);
      const color = standardized(scores.color),
        edge = standardized(scores.edge);
      return {
        image,
        scores,
        strength: Math.max(...scores.color) + Math.max(...scores.edge),
        fused: Float32Array.from(color, (value, index) => value + edge[index]!),
      };
    })
    .sort((a, b) => b.strength - a.strength);
  const considered =
    views[0]!.strength - views[1]!.strength < ORIENTATION_MARGIN
      ? views
      : views.slice(0, 1);
  const rerankStarted = performance.now();
  const outcomes = [];
  for (const view of considered) {
    const order = (values: Float32Array) =>
      [...values.keys()].sort((a, b) => values[b]! - values[a]!);
    const byFused = order(view.fused);
    const selected = new Set([
      ...order(view.scores.color).slice(0, COLOR_SHORTLIST),
      ...order(view.scores.edge).slice(0, EDGE_SHORTLIST),
    ]);
    const leadingIdentities = new Set(
      byFused
        .slice(0, LEADING_IDENTITIES)
        .map((index) => corpus.cards[index]!.oracleId),
    );
    for (const index of byFused)
      if (
        selected.size < RERANK_LIMIT &&
        leadingIdentities.has(corpus.cards[index]!.oracleId)
      )
        selected.add(index);
    const shortlist = [...selected];
    const reranked = await runner.rerank({
      gray: grayscale(view.image.rgb),
      width: view.image.width,
      height: view.image.height,
      cardWindow: view.image.card,
      scryfallIds: shortlist.map((index) => corpus.cards[index]!.scryfallId),
    });
    const ranked = reranked.evidence
      .map((evidence, position) => {
        const index = shortlist[position]!;
        return {
          ...evidence,
          index,
          color: view.scores.color[index]!,
          edge: view.scores.edge[index]!,
          appearance: view.fused[index]!,
        };
      })
      .sort(
        (a, b) =>
          verifiedScore(b) - verifiedScore(a) ||
          b.appearance - a.appearance ||
          a.scryfallId.localeCompare(b.scryfallId),
      );
    outcomes.push({ view, shortlist, ranked });
  }
  const rerankFinished = performance.now();
  const chosen = outcomes.reduce((best, outcome) =>
    verifiedScore(outcome.ranked[0]!) > verifiedScore(best.ranked[0]!)
      ? outcome
      : best,
  );
  const top = corpus.cards[chosen.ranked[0]!.index]!;
  const compared = new Set(
    chosen.ranked.map((candidate) => candidate.scryfallId),
  );
  const decision = decideRectifiedAcceptance(
    chosen.ranked,
    top.illustrationId
      ? corpus.catalog.filter(
          (card) =>
            card.illustrationId === top.illustrationId &&
            !compared.has(card.scryfallId),
        ).length
      : 0,
  );
  const crop = await rectifiedCropJpeg(chosen.view.image);
  const recognition: RectifiedRecognition = {
    scanId: input.scanId,
    serviceLatencyMs: Math.round(performance.now() - started),
    stageMs: {
      decode: Math.round(upright.decodeMs),
      rectify: Math.round(upright.rectifyMs),
      rank: Math.round(rerankStarted - rankStarted),
      rerank: Math.round(rerankFinished - rerankStarted),
    },
    rotation: chosen.view.image.rotation,
    candidates: chosen.ranked.slice(0, 5).map((candidate) => {
      const card = corpus.cards[candidate.index]!;
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
  };
  return {
    crop,
    recognition,
    trace: {
      strengths: views.map((view) => ({
        rotation: view.image.rotation,
        strength: view.strength,
      })),
      reranked: outcomes.length,
      shortlist: chosen.shortlist.map(
        (index) => corpus.cards[index]!.scryfallId,
      ),
      ranked: chosen.ranked,
      scores: chosen.view.scores,
      fused: chosen.view.fused,
    },
  };
}
