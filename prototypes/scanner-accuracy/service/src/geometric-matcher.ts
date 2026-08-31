import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { normalizedCard } from "./image-distance.js";
import { createRequire } from "node:module";
import { dataRoot } from "./config.js";
import type { CorpusCard } from "./ranking.js";
import {
  decideGeometricAcceptance,
  finiteConvexQuad,
  verifiedInlierSupport,
} from "./geometric-decision.js";

const MAX_FEATURES = 1_500;
const RATIO = 0.78;
type Cv = any;
type Reference = {
  descriptors: any;
  keypoints: any;
  width: number;
  height: number;
};
const references = new Map<string, Reference>();
const require = createRequire(import.meta.url);
const cvModule: any = require("@techstark/opencv-js");
let cvPromise: Promise<Cv> | undefined;

async function cv(): Promise<Cv> {
  cvPromise ??= (async () => {
    const module: any = cvModule as any;
    if (module instanceof Promise) return module;
    if (module.Mat) return module;
    await new Promise<void>((resolve) => {
      module.onRuntimeInitialized = resolve;
    });
    return module;
  })();
  return cvPromise;
}
function dispose(...values: any[]) {
  for (const value of values.flat()) {
    try {
      value?.delete?.();
    } catch {
      /* best effort cleanup during errors */
    }
  }
}
async function cropToMat(buffer: Buffer, openCv: Cv) {
  // Reuse the baseline's exact oriented 63:88 card-aspect 72%-guide geometry.
  const cropped = await normalizedCard(buffer, 0.72);
  const image = sharp(cropped);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("image has no dimensions");
  const raw = await image.ensureAlpha().raw().toBuffer();
  return openCv.matFromImageData({
    data: new Uint8ClampedArray(raw),
    width: metadata.width,
    height: metadata.height,
  });
}
function features(image: any, openCv: Cv) {
  const gray = new openCv.Mat();
  const keypoints = new openCv.KeyPointVector();
  const descriptors = new openCv.Mat();
  let orb: any, mask: any;
  try {
    openCv.cvtColor(image, gray, openCv.COLOR_RGBA2GRAY);
    orb = new openCv.ORB(MAX_FEATURES);
    mask = new openCv.Mat();
    orb.detectAndCompute(gray, mask, keypoints, descriptors);
    return { keypoints, descriptors };
  } catch (error) {
    dispose(keypoints, descriptors);
    throw error;
  } finally {
    dispose(gray, orb, mask);
  }
}
async function reference(
  card: CorpusCard,
  openCv: Cv,
  referenceRoot: string,
): Promise<Reference> {
  const cacheKey = `${referenceRoot}:${card.scryfallId}`;
  const known = references.get(cacheKey);
  if (known) return known;
  const image = await cropToMat(
    await fs.readFile(path.join(referenceRoot, `${card.scryfallId}.jpg`)),
    openCv,
  );
  try {
    const value = {
      ...features(image, openCv),
      width: image.cols,
      height: image.rows,
    };
    references.set(cacheKey, value);
    return value;
  } finally {
    dispose(image);
  }
}
export type FrameDiagnostic = {
  keypoints: number;
  goodMatches: number;
  inliers: number;
  inlierRatio: number;
  homographyValid: boolean;
  quadValid: boolean;
  areaFraction: number;
  error?: string;
};
export type GeometricCandidate = {
  card: CorpusCard;
  frames: FrameDiagnostic[];
  support: number;
  acceptedFrames: number;
};
export type GeometricResult = {
  candidates: GeometricCandidate[];
  acceptedScryfallId: string | null;
  abstentionReasons: string[];
  warmLatencyMs: number;
  rssBytes: number;
};

function compare(frame: any, ref: Reference, openCv: Cv): FrameDiagnostic {
  const empty = (): FrameDiagnostic => ({
    keypoints: frame.keypoints.size(),
    goodMatches: 0,
    inliers: 0,
    inlierRatio: 0,
    homographyValid: false,
    quadValid: false,
    areaFraction: 0,
  });
  if (frame.descriptors.empty() || ref.descriptors.empty()) return empty();
  let matcher: any,
    pairs: any,
    source: any,
    destination: any,
    mask: any,
    homography: any,
    corners: any,
    projected: any;
  const good: any[] = [];
  try {
    matcher = new openCv.BFMatcher(openCv.NORM_HAMMING, false);
    pairs = new openCv.DMatchVectorVector();
    matcher.knnMatch(ref.descriptors, frame.descriptors, pairs, 2);
    for (let i = 0; i < pairs.size(); i++) {
      const pair = pairs.get(i);
      try {
        if (
          pair.size() >= 2 &&
          pair.get(0).distance < RATIO * pair.get(1).distance
        )
          good.push(pair.get(0));
      } finally {
        dispose(pair);
      }
    }
    if (good.length < 4) return { ...empty(), goodMatches: good.length };
    const src: number[] = [],
      dst: number[] = [];
    for (const match of good) {
      const a = ref.keypoints.get(match.queryIdx).pt;
      const b = frame.keypoints.get(match.trainIdx).pt;
      src.push(a.x, a.y);
      dst.push(b.x, b.y);
    }
    source = openCv.matFromArray(good.length, 1, openCv.CV_32FC2, src);
    destination = openCv.matFromArray(good.length, 1, openCv.CV_32FC2, dst);
    mask = new openCv.Mat();
    homography = openCv.findHomography(
      source,
      destination,
      openCv.RANSAC,
      4,
      mask,
    );
    const homographyValid =
      !!homography &&
      !homography.empty() &&
      Array.from(homography.data64F ?? homography.data32F ?? []).every(
        Number.isFinite,
      );
    let inliers = 0;
    for (let i = 0; i < mask.rows; i++) inliers += mask.data[i] ? 1 : 0;
    let quadValid = false,
      areaFraction = 0;
    if (homographyValid) {
      corners = openCv.matFromArray(4, 1, openCv.CV_32FC2, [
        0,
        0,
        ref.width,
        0,
        ref.width,
        ref.height,
        0,
        ref.height,
      ]);
      projected = new openCv.Mat();
      openCv.perspectiveTransform(corners, projected, homography);
      const checked = finiteConvexQuad(
        Array.from(projected.data32F),
        frame.width,
        frame.height,
      );
      quadValid = checked.valid;
      areaFraction = checked.areaFraction;
    }
    return {
      keypoints: frame.keypoints.size(),
      goodMatches: good.length,
      inliers,
      inlierRatio: good.length ? inliers / good.length : 0,
      homographyValid,
      quadValid,
      areaFraction,
    };
  } catch (error) {
    return {
      ...empty(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    dispose(
      matcher,
      pairs,
      source,
      destination,
      mask,
      homography,
      corners,
      projected,
      good,
    );
  }
}
/** Isolated offline reranker. Candidate input must already be identity/name-gated. */
export async function rerankGeometrically(
  stills: [Buffer, Buffer, Buffer],
  candidates: CorpusCard[],
  options: { referenceRoot?: string } = {},
): Promise<GeometricResult> {
  const started = performance.now();
  const openCv = await cv();
  const frameFeatures: any[] = [];
  try {
    for (const still of stills) {
      const image = await cropToMat(still, openCv);
      try {
        frameFeatures.push({
          ...features(image, openCv),
          width: image.cols,
          height: image.rows,
        });
      } finally {
        dispose(image);
      }
    }
    const scored: GeometricCandidate[] = [];
    for (const card of candidates) {
      const ref = await reference(
        card,
        openCv,
        options.referenceRoot ?? path.join(dataRoot, "scryfall", "images"),
      );
      const frames = frameFeatures.map((frame) => compare(frame, ref, openCv));
      const verified = verifiedInlierSupport(frames);
      scored.push({ card, frames, ...verified });
    }
    const decision = decideGeometricAcceptance(scored);
    return {
      candidates: decision.candidates,
      acceptedScryfallId: decision.acceptedScryfallId,
      abstentionReasons: decision.abstentionReasons,
      warmLatencyMs: Math.round(performance.now() - started),
      rssBytes: process.memoryUsage().rss,
    };
  } finally {
    for (const frame of frameFeatures)
      dispose(frame.keypoints, frame.descriptors);
  }
}
export function clearGeometricReferenceCache() {
  for (const ref of references.values())
    dispose(ref.keypoints, ref.descriptors);
  references.clear();
}
export { decideGeometricAcceptance, finiteConvexQuad, verifiedInlierSupport };
