export const MIN_INLIERS = 25;
export const MIN_DISTINCT_CELLS = 15;
export const MAX_RIVAL_DISTINCT_SHARE = 0.5;
export const MIN_APPEARANCE_MARGIN = 0.05;

export type VerifiedCandidate = {
  scryfallId: string;
  inliers: number;
  plausible: boolean;
  inlierCells: number[];
  appearance: number;
};

export function verifiedScore(candidate: VerifiedCandidate) {
  return candidate.plausible ? candidate.inliers : 0;
}

export function decideRectifiedAcceptance(ranked: VerifiedCandidate[]): {
  accepted: boolean;
  scryfallId: string | null;
  reasons: string[];
} {
  const [first, ...rest] = ranked;
  const reasons: string[] = [];
  if (!first || verifiedScore(first) === 0)
    reasons.push("no candidate has a plausible card homography");
  else {
    if (first.inliers < MIN_INLIERS)
      reasons.push(
        `top candidate has ${first.inliers} RANSAC inliers; at least ${MIN_INLIERS} are required`,
      );
    const topCells = new Set(first.inlierCells);
    for (const rival of rest.filter((candidate) => verifiedScore(candidate))) {
      const rivalCells = new Set(rival.inlierCells);
      const topOnly = first.inlierCells.filter(
        (cell) => !rivalCells.has(cell),
      ).length;
      const rivalOnly = rival.inlierCells.filter(
        (cell) => !topCells.has(cell),
      ).length;
      if (
        topOnly < MIN_DISTINCT_CELLS ||
        rivalOnly > topOnly * MAX_RIVAL_DISTINCT_SHARE
      ) {
        reasons.push(
          `printing ${rival.scryfallId} is too close: ${topOnly} inlier cells support only the top candidate and ${rivalOnly} support only the rival`,
        );
        break;
      }
    }
    const appearanceRival = Math.max(
      -1,
      ...rest.map((candidate) => candidate.appearance),
    );
    if (first.appearance - appearanceRival < MIN_APPEARANCE_MARGIN)
      reasons.push(
        `appearance does not single out the top candidate: ${first.appearance.toFixed(3)} against ${appearanceRival.toFixed(3)}`,
      );
  }
  return {
    accepted: reasons.length === 0,
    scryfallId: reasons.length === 0 ? first!.scryfallId : null,
    reasons,
  };
}
