import { createRequire } from "node:module";
import { CARD_HEIGHT, CARD_WIDTH } from "./rectify.js";

export const REFERENCE_FEATURES = 800;
export const QUERY_FEATURES = 1500;
const RATIO = 0.8;
const RANSAC_ITERATIONS = 500;
const INLIER_CELL = 24;

export type OrbFeatures = { points: Float32Array; descriptors: Uint8Array };
export type FeatureWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type GeometricEvidence = {
  goodMatches: number;
  inliers: number;
  inlierRatio: number;
  plausible: boolean;
  inlierCells: number[];
};

const require = createRequire(import.meta.url);
let openCvPromise: Promise<any> | undefined;

export function grayscale(rgb: Uint8Array): Uint8Array {
  const gray = new Uint8Array(rgb.length / 3);
  for (let index = 0; index < gray.length; index++)
    gray[index] = Math.round(
      0.299 * rgb[index * 3]! +
        0.587 * rgb[index * 3 + 1]! +
        0.114 * rgb[index * 3 + 2]!,
    );
  return gray;
}

export function loadOpenCv(): Promise<any> {
  openCvPromise ??= (async () => {
    const module: any = require("@techstark/opencv-js");
    if (module instanceof Promise) return module;
    if (module.Mat) return module;
    await new Promise<void>((resolve) => {
      module.onRuntimeInitialized = resolve;
    });
    return module;
  })();
  return openCvPromise;
}

function release(...values: any[]) {
  for (const value of values) {
    try {
      value?.delete?.();
    } catch {
      continue;
    }
  }
}

export function orbFeatures(
  cv: any,
  gray: Uint8Array,
  width: number,
  height: number,
  maximum: number,
): OrbFeatures {
  const image = cv.matFromArray(height, width, cv.CV_8UC1, gray);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat();
  const orb = new cv.ORB(maximum);
  try {
    orb.detectAndCompute(image, mask, keypoints, descriptors);
    const count = descriptors.rows;
    const points = new Float32Array(count * 2);
    for (let index = 0; index < count; index++) {
      const point = keypoints.get(index).pt;
      points[index * 2] = point.x;
      points[index * 2 + 1] = point.y;
    }
    return {
      points,
      descriptors: new Uint8Array(descriptors.data.slice(0, count * 32)),
    };
  } finally {
    release(image, keypoints, descriptors, mask, orb);
  }
}

export function descriptorMat(cv: any, features: OrbFeatures) {
  return cv.matFromArray(
    features.descriptors.length / 32,
    32,
    cv.CV_8U,
    features.descriptors,
  );
}

export function matchReference(
  cv: any,
  query: OrbFeatures,
  queryDescriptors: any,
  queryWindow: FeatureWindow,
  queryBounds: { width: number; height: number },
  reference: OrbFeatures,
): GeometricEvidence {
  const none = {
    goodMatches: 0,
    inliers: 0,
    inlierRatio: 0,
    plausible: false,
    inlierCells: [],
  };
  if (!reference.descriptors.length || queryDescriptors.empty()) return none;
  let referenceDescriptors: any,
    matcher: any,
    pairs: any,
    source: any,
    destination: any,
    mask: any,
    homography: any,
    corners: any,
    projected: any;
  try {
    referenceDescriptors = descriptorMat(cv, reference);
    matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    pairs = new cv.DMatchVectorVector();
    matcher.knnMatch(referenceDescriptors, queryDescriptors, pairs, 2);
    const sourcePoints: number[] = [],
      destinationPoints: number[] = [];
    for (let index = 0; index < pairs.size(); index++) {
      const pair = pairs.get(index);
      if (pair.size() >= 2) {
        const best = pair.get(0),
          next = pair.get(1);
        if (best.distance < RATIO * next.distance) {
          sourcePoints.push(
            reference.points[best.queryIdx * 2]!,
            reference.points[best.queryIdx * 2 + 1]!,
          );
          destinationPoints.push(
            query.points[best.trainIdx * 2]!,
            query.points[best.trainIdx * 2 + 1]!,
          );
        }
      }
      release(pair);
    }
    const goodMatches = sourcePoints.length / 2;
    if (goodMatches < 6) return { ...none, goodMatches };
    source = cv.matFromArray(goodMatches, 1, cv.CV_32FC2, sourcePoints);
    destination = cv.matFromArray(
      goodMatches,
      1,
      cv.CV_32FC2,
      destinationPoints,
    );
    mask = new cv.Mat();
    homography = cv.findHomography(
      source,
      destination,
      cv.RANSAC,
      5,
      mask,
      RANSAC_ITERATIONS,
      0.995,
    );
    if (!homography || homography.empty()) return { ...none, goodMatches };
    const cells = new Set<number>();
    let inliers = 0;
    for (let index = 0; index < goodMatches; index++)
      if (mask.data[index]) {
        inliers += 1;
        cells.add(
          Math.floor(destinationPoints[index * 2 + 1]! / INLIER_CELL) * 1_000 +
            Math.floor(destinationPoints[index * 2]! / INLIER_CELL),
        );
      }
    corners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      CARD_WIDTH,
      0,
      CARD_WIDTH,
      CARD_HEIGHT,
      0,
      CARD_HEIGHT,
    ]);
    projected = new cv.Mat();
    cv.perspectiveTransform(corners, projected, homography);
    const quad = Array.from(projected.data32F as Float32Array);
    let doubledArea = 0,
      convex = true;
    for (let index = 0; index < 4; index++) {
      const ax = quad[index * 2]!,
        ay = quad[index * 2 + 1]!,
        bx = quad[((index + 1) % 4) * 2]!,
        by = quad[((index + 1) % 4) * 2 + 1]!,
        cx = quad[((index + 2) % 4) * 2]!,
        cy = quad[((index + 2) % 4) * 2 + 1]!;
      if (!((bx - ax) * (cy - by) - (by - ay) * (cx - bx) > 0)) convex = false;
      doubledArea += ax * by - bx * ay;
    }
    const areaRatio =
      doubledArea / 2 / (queryWindow.width * queryWindow.height);
    const slackX = queryBounds.width * 0.15,
      slackY = queryBounds.height * 0.15;
    const inside = quad.every((value, index) =>
      Number.isFinite(value) && index % 2
        ? value > -slackY && value < queryBounds.height + slackY
        : value > -slackX && value < queryBounds.width + slackX,
    );
    return {
      goodMatches,
      inliers,
      inlierRatio: inliers / goodMatches,
      plausible: convex && inside && areaRatio > 0.45 && areaRatio < 1.7,
      inlierCells: [...cells],
    };
  } catch {
    return none;
  } finally {
    release(
      referenceDescriptors,
      matcher,
      pairs,
      source,
      destination,
      mask,
      homography,
      corners,
      projected,
    );
  }
}
