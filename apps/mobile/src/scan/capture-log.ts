import type { DetectionSample } from '../../modules/card-detector';
import { isStopped, type CaptureState, type CaptureStep } from './capture';

const timingWindowSamples = 300;

type TimingSample = { durationMs: number; sampledAtMs: number };

function logCaptureEvent(event: string, details: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`CAPTURE ${JSON.stringify({ event, ...details })}`);
  }
}

function nearestRank(sorted: number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function timingSummary(window: TimingSample[]) {
  const durations = window.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const gaps = window.slice(1).map((sample, index) => sample.sampledAtMs - window[index].sampledAtMs);
  const spanMs = window[window.length - 1].sampledAtMs - window[0].sampledAtMs;
  return {
    samples: window.length,
    p50Ms: nearestRank(durations, 0.5),
    p95Ms: nearestRank(durations, 0.95),
    maxMs: durations[durations.length - 1],
    hz: spanMs > 0 ? ((window.length - 1) * 1000) / spanMs : 0,
    maxGapMs: Math.max(...gaps),
  };
}

export function createCaptureLog() {
  let timing: TimingSample[] = [];

  function sample(before: CaptureState, step: CaptureStep, detection: DetectionSample) {
    const at = detection.sampledAtMs;
    const after = step.state.machine;
    if (detection.runtimeErrorCode !== null) {
      logCaptureEvent('stopped', { at, reason: detection.runtimeErrorCode });
    }
    if (step.resumedAfterGap) {
      logCaptureEvent('resumed-after-gap', { at, gapMs: at - (before.lastSampledAtMs ?? at), phase: after.phase });
    }
    if (step.rearmed) {
      logCaptureEvent('rearmed', { at, reason: detection.detected ? 'card-changed' : 'card-absent' });
    }
    if (step.requestPhoto) {
      logCaptureEvent('photo-requested', { at });
    }
    timing.push({ durationMs: detection.nativeDurationMs, sampledAtMs: at });
    if (timing.length === timingWindowSamples) {
      logCaptureEvent('detector-timing', timingSummary(timing));
      timing = [];
    }
  }

  function photoTaken() {
    logCaptureEvent('photo-taken', {});
  }

  function photoFailed(state: CaptureState) {
    logCaptureEvent('photo-failed', { failedPhotos: state.failedPhotos, stopped: isStopped(state) });
  }

  return { sample, photoTaken, photoFailed };
}
