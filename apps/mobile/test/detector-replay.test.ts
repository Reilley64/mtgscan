import type { FrameQuad } from '../modules/card-detector';
import {
  compareReplays,
  replayTable,
  scoreReplay,
  type FrameLabel,
  type FrameLabels,
  type FrameSample,
} from './scanner-evidence/detector/score';

const frameWidth = 1000;
const frameHeight = 1200;
const pixelsPerMm = 5;

function cardAt(left: number, top: number): FrameLabel['corners'] {
  const right = left + 63 * pixelsPerMm;
  const bottom = top + 88 * pixelsPerMm;
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

function label(frame: string, corners: FrameLabel['corners']): FrameLabel {
  return {
    frame,
    condition: corners ? 'plain' : 'empty-plain',
    scryfallId: corners ? 'card' : null,
    borderColor: corners ? 'black' : null,
    corners,
    tiltDegrees: 0,
    intrinsicMatrix: [[950, 0, 500], [0, 950, 600], [0, 0, 1]],
  };
}

const labels: FrameLabels = {
  frameWidth,
  frameHeight,
  cardMm: [63, 88],
  frames: [label('plain-000.png', cardAt(200, 300)), label('empty-plain-000.png', null)],
};

function sample(frame: string, outline: [number, number][] | null, nativeDurationMs = 4): FrameSample {
  const corners = outline && (outline.map(([x, y]) => ({ x: x / frameWidth, y: y / frameHeight })) as FrameQuad);
  return {
    frame,
    detected: corners !== null,
    corners,
    proposalDetected: corners !== null,
    proposalCorners: corners,
    confidence: 0.9,
    areaRatio: 0.2,
    aspectRatio: 63 / 88,
    edgeSupportMin: 0.9,
    signature: [],
    frameWidth,
    frameHeight,
    nativeDurationMs,
    sampledAtMs: 0,
    runtimeErrorCode: null,
  };
}

function run(cardOutline: [number, number][] | null, emptyOutline: [number, number][] | null = null, roundDurationsMs = [4]) {
  return scoreReplay(
    labels,
    roundDurationsMs.map((nativeDurationMs) => [
      sample('plain-000.png', cardOutline, nativeDurationMs),
      sample('empty-plain-000.png', emptyOutline, nativeDurationMs),
    ]),
  );
}

function failedBars(comparison: ReturnType<typeof compareReplays>) {
  return comparison.bars.filter((bar) => bar.pass === false).map((bar) => bar.metric);
}

function bar(comparison: ReturnType<typeof compareReplays>, metric: string) {
  return comparison.bars.find((candidate) => candidate.metric === metric);
}

test('the detector replay measures corner error in mm on the card', () => {
  const shiftedRight = cardAt(200 + 2 * pixelsPerMm, 300)!;

  const [plain] = run(shiftedRight).conditions;

  expect(plain.detected).toBe(1);
  expect(plain.cornerErrorMm?.median).toBeCloseTo(2);
  expect(plain.insideOutlines).toEqual(['plain-000.png']);
});

test('a planted inside outline fails the inside outlines bar against the merge base', () => {
  const onTheEdge = cardAt(200, 300)!;
  const insideAtTheTop = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 1.5 * pixelsPerMm : y]);

  const comparison = compareReplays(run(onTheEdge), run(insideAtTheTop), { sameDetector: false });

  expect(bar(comparison, 'Inside outlines')).toMatchObject({ base: '0', branch: '1', pass: false });
  expect(comparison.pass).toBe(false);
  expect(replayTable(comparison)).toContain('plain-000.png: outline at (200, 308) (515, 308) (515, 740) (200, 740), sides inside top 1.5 mm');
});

test('an outline less than 1 mm inside the card edge is not an inside outline', () => {
  const onTheEdge = cardAt(200, 300)!;
  const slightlyInside = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 0.8 * pixelsPerMm : y]);

  const comparison = compareReplays(run(onTheEdge), run(slightlyInside), { sameDetector: false });

  expect(bar(comparison, 'Inside outlines')).toMatchObject({ branch: '0', pass: true });
});

test('an outline on an empty plain surface fails the false outlines bar', () => {
  const onTheEdge = cardAt(200, 300)!;

  const comparison = compareReplays(run(onTheEdge), run(onTheEdge, cardAt(400, 500)), { sameDetector: false });

  expect(failedBars(comparison)).toEqual(['False outlines']);
});

test('the same detector code fails the replay when it gives other numbers, and not when only timing differs', () => {
  const onTheEdge = cardAt(200, 300)!;
  const shifted = cardAt(201, 300)!;

  expect(compareReplays(run(onTheEdge), run(onTheEdge, null, [4.5]), { sameDetector: true }).pass).toBe(true);
  expect(failedBars(compareReplays(run(onTheEdge), run(shifted), { sameDetector: true }))).toContain('Same detector code');
});


test('one slow round does not fail the Mac timing bar when the other rounds hold steady', () => {
  const onTheEdge = cardAt(200, 300)!;

  const comparison = compareReplays(run(onTheEdge, null, [4, 4, 4]), run(onTheEdge, null, [4, 40, 4]), { sameDetector: false });

  expect(bar(comparison, 'Mac timing p95')).toMatchObject({ base: '4.0 ms', branch: '4.0 ms', pass: true });
});

test('a branch slower than 1.2 times the merge base on most rounds fails the Mac timing bar', () => {
  const onTheEdge = cardAt(200, 300)!;

  const comparison = compareReplays(run(onTheEdge, null, [4, 4, 4]), run(onTheEdge, null, [4, 5, 5]), { sameDetector: false });

  expect(bar(comparison, 'Mac timing p95')).toMatchObject({ base: '4.0 ms', branch: '5.0 ms', pass: false });
});
