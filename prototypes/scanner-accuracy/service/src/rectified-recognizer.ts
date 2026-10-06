import type { CardQuad } from "./rectify.js";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  decodeForPrinting,
  rectifiedCropJpeg,
  rectifyCard,
  rotateHalfTurn,
} from "./rectify.js";
import {
  checkPrinting,
  multiply,
  PRINTING_HEIGHT,
  PRINTING_WIDTH,
  translate,
  type PrintingCheck,
} from "./rectified-printing.js";
import { rankByAppearance } from "./rectified-ranking.js";
import { grayscale } from "./rectified-features.js";
import type { RectifiedCard, RectifiedCorpus } from "./rectified-corpus.js";
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
  printingCheck: {
    illustrationId: string;
    chosen: string | null;
    reason: string | null;
    ms: number;
    alignment: PrintingCheck["alignment"];
    members: Array<{
      scryfallId: string;
      set: string;
      collectorNumber: string;
      cluster: number;
      coarse: number;
      fine: number | null;
      markError: number | null;
      unexplained: number | null;
    }>;
  } | null;
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
  const printing = corpus.printing;
  let highResolution: ReturnType<typeof decodeForPrinting> | undefined;
  const decodeHighResolution = () => {
    highResolution ??= decodeForPrinting(input.photo, upright, PRINTING_HEIGHT);
    highResolution.catch(() => undefined);
    return highResolution;
  };
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
    if (
      printing &&
      byFused
        .slice(0, LEADING_IDENTITIES)
        .some((index) =>
          printing.groups.has(corpus.cards[index]!.illustrationId ?? ""),
        )
    )
      decodeHighResolution();
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
  const printingStarted = performance.now();
  const group =
    printing && top.illustrationId && chosen.ranked[0]!.homography
      ? await printing.load(top.illustrationId)
      : null;
  let check: PrintingCheck | null = null;
  if (
    group &&
    group.clusters.some((cluster) => cluster.members.includes(top.scryfallId))
  ) {
    const photo = await decodeHighResolution();
    const referenceScaleX = CARD_WIDTH / PRINTING_WIDTH,
      referenceScaleY = CARD_HEIGHT / PRINTING_HEIGHT;
    check = checkPrinting(
      group,
      top.scryfallId,
      photo,
      [
        [photo.width, 0, -0.5, 0, photo.height, -0.5, 0, 0, 1],
        chosen.view.image.toPhoto,
        translate(0.5, 0.5),
        chosen.ranked[0]!.homography!,
        [
          referenceScaleX,
          0,
          0.5 * referenceScaleX - 0.5,
          0,
          referenceScaleY,
          0.5 * referenceScaleY - 0.5,
          0,
          0,
          1,
        ],
      ].reduce(multiply),
    );
  }
  const printingFinished = performance.now();
  const covered = check
    ? new Set(group!.clusters.flatMap((cluster) => cluster.members))
    : compared;
  const lookalikes = top.illustrationId
    ? corpus.catalog.filter(
        (card) =>
          card.illustrationId === top.illustrationId &&
          !covered.has(card.scryfallId),
      ).length
    : 0;
  const settled = check
    ? decideRectifiedAcceptance(
        [
          { ...chosen.ranked[0]!, scryfallId: check.chosen ?? top.scryfallId },
          ...chosen.ranked.filter(
            (candidate) =>
              corpus.cards[candidate.index]!.illustrationId !==
              top.illustrationId,
          ),
        ],
        lookalikes,
      )
    : decideRectifiedAcceptance(chosen.ranked, lookalikes);
  const decision =
    check && !check.chosen
      ? {
          accepted: false,
          scryfallId: null,
          reasons: [...settled.reasons, check.reason!],
        }
      : settled;
  const describe = (scryfallId: string) =>
    corpus.catalog.find((card) => card.scryfallId === scryfallId)!;
  const pick = (card: RectifiedCard) => ({
    scryfallId: card.scryfallId,
    oracleId: card.oracleId,
    name: card.name,
    set: card.set,
    collectorNumber: card.collectorNumber,
  });
  const candidates = chosen.ranked.map((candidate) => ({
    ...pick(corpus.cards[candidate.index]!),
    score: verifiedScore(candidate),
  }));
  const promoted =
    check?.chosen && check.chosen !== top.scryfallId
      ? (candidates.find(
          (candidate) => candidate.scryfallId === check.chosen,
        ) ?? {
          ...pick(describe(check.chosen)),
          score: verifiedScore(chosen.ranked[0]!),
        })
      : null;
  const ordered = promoted
    ? [
        promoted,
        ...candidates.filter(
          (candidate) => candidate.scryfallId !== promoted.scryfallId,
        ),
      ]
    : candidates;
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
    candidates: ordered.slice(0, 5),
    decision,
    printingCheck: check && {
      illustrationId: check.illustrationId,
      chosen: check.chosen,
      reason: check.reason,
      ms: Math.round(printingFinished - printingStarted),
      alignment: check.alignment,
      members: check.members.map((member) => ({
        ...member,
        set: describe(member.scryfallId).set,
        collectorNumber: describe(member.scryfallId).collectorNumber,
      })),
    },
  };
  return {
    crop,
    printingCanvas: check?.canvas ?? null,
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
