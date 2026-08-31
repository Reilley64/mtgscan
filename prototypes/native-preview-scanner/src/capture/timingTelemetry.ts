export const TIMING_WINDOW_SAMPLES = 300;

export type TimingTelemetry = {
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export const EMPTY_TIMING_TELEMETRY: TimingTelemetry = {
  sampleCount: 0,
  p50Ms: 0,
  p95Ms: 0,
  maxMs: 0,
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
