export const TIMING_WINDOW_SAMPLES = 300;
export const TARGET_ANALYSIS_HZ = 5;
export const MINIMUM_ACCEPTED_EFFECTIVE_HZ = 4.5;

export type TimingTelemetry = {
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type AnalysisTelemetry = TimingTelemetry & {
  elapsedSpanMs: number;
  effectiveHz: number;
  maxGapMs: number;
  cadencePass: boolean;
};

export const EMPTY_TIMING_TELEMETRY: AnalysisTelemetry = {
  sampleCount: 0,
  p50Ms: 0,
  p95Ms: 0,
  maxMs: 0,
  elapsedSpanMs: 0,
  effectiveHz: 0,
  maxGapMs: 0,
  cadencePass: false,
};

export function recordProcessingTime(
  history: number[],
  processingMs: number,
): TimingTelemetry {
  history.push(processingMs);
  if (history.length > TIMING_WINDOW_SAMPLES) history.shift();

  const sorted = [...history].sort((left, right) => left - right);
  const percentile = (percent: number) =>
    sorted[Math.ceil(percent * sorted.length) - 1]!;

  return {
    sampleCount: history.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1]!,
  };
}

export function recordAnalysisSample(
  processingHistory: number[],
  wallTimestampHistory: number[],
  processingMs: number,
  sampleWallAtMs: number,
): AnalysisTelemetry {
  const timing = recordProcessingTime(processingHistory, processingMs);
  wallTimestampHistory.push(sampleWallAtMs);
  if (wallTimestampHistory.length > TIMING_WINDOW_SAMPLES)
    wallTimestampHistory.shift();

  const first = wallTimestampHistory[0] ?? sampleWallAtMs;
  const last = wallTimestampHistory[wallTimestampHistory.length - 1] ?? first;
  const elapsedSpanMs = Math.max(0, last - first);
  let maxGapMs = 0;
  for (let index = 1; index < wallTimestampHistory.length; index++) {
    maxGapMs = Math.max(
      maxGapMs,
      wallTimestampHistory[index]! - wallTimestampHistory[index - 1]!,
    );
  }
  const effectiveHz =
    wallTimestampHistory.length > 1 && elapsedSpanMs > 0
      ? ((wallTimestampHistory.length - 1) * 1_000) / elapsedSpanMs
      : 0;

  return {
    ...timing,
    elapsedSpanMs,
    effectiveHz,
    maxGapMs,
    cadencePass:
      timing.sampleCount === TIMING_WINDOW_SAMPLES &&
      effectiveHz >= MINIMUM_ACCEPTED_EFFECTIVE_HZ,
  };
}
