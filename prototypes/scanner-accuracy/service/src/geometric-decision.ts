export type AcceptanceCandidate = {
  card: { scryfallId: string };
  support: number;
  acceptedFrames: number;
};
export function decideGeometricAcceptance<T extends AcceptanceCandidate>(
  scored: T[],
) {
  const candidates = [...scored].sort(
    (a, b) =>
      b.support - a.support ||
      a.card.scryfallId.localeCompare(b.card.scryfallId),
  );
  const first = candidates[0],
    second = candidates[1];
  const abstentionReasons: string[] = [];
  if (!first) abstentionReasons.push("no identity-gated candidates");
  else {
    if (first.acceptedFrames < 2)
      abstentionReasons.push("fewer than two plausible homography frames");
    if (first.support - (second?.support ?? 0) < 50)
      abstentionReasons.push("top-two inlier support margin is below 50");
  }
  return {
    candidates,
    acceptedScryfallId: abstentionReasons.length
      ? null
      : first!.card.scryfallId,
    abstentionReasons,
  };
}
export function finiteConvexQuad(
  points: number[],
  frameWidth: number,
  frameHeight: number,
) {
  const frameArea = frameWidth * frameHeight;
  if (points.length !== 8 || points.some((point) => !Number.isFinite(point)))
    return { valid: false, areaFraction: 0 };
  // Permit modest perspective overshoot, but not a card projected off the crop.
  const xTolerance = frameWidth * 0.1,
    yTolerance = frameHeight * 0.1;
  if (
    points.some((point, index) =>
      index % 2
        ? point < -yTolerance || point > frameHeight + yTolerance
        : point < -xTolerance || point > frameWidth + xTolerance,
    )
  )
    return { valid: false, areaFraction: 0 };
  let signed = 0;
  for (let i = 0; i < 4; i++)
    signed +=
      points[i * 2]! * points[((i + 1) % 4) * 2 + 1]! -
      points[((i + 1) % 4) * 2]! * points[i * 2 + 1]!;
  const areaFraction = Math.abs(signed) / 2 / frameArea;
  let direction = 0;
  for (let i = 0; i < 4; i++) {
    const a = i * 2,
      b = ((i + 1) % 4) * 2,
      c = ((i + 2) % 4) * 2;
    const cross =
      (points[b]! - points[a]!) * (points[c + 1]! - points[b + 1]!) -
      (points[b + 1]! - points[a + 1]!) * (points[c]! - points[b]!);
    if (!cross || (direction && Math.sign(cross) !== direction))
      return { valid: false, areaFraction };
    direction = Math.sign(cross);
  }
  return { valid: areaFraction >= 0.08 && areaFraction <= 1.2, areaFraction };
}

export type VerificationFrame = {
  quadValid: boolean;
  inliers: number;
  inlierRatio: number;
};
export function verifiedInlierSupport(frames: VerificationFrame[]) {
  const verified = frames
    .filter(
      (frame) =>
        frame.quadValid && frame.inliers >= 20 && frame.inlierRatio >= 0.4,
    )
    .sort((a, b) => b.inliers - a.inliers)
    .slice(0, 2);
  return {
    support: verified.reduce((total, frame) => total + frame.inliers, 0),
    acceptedFrames: verified.length,
  };
}
