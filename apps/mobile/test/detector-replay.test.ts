import type { FrameQuad } from '../modules/card-detector';
import {
  compareReplays,
  replayTable,
  scoreReplay,
  type FrameLabel,
  type FrameLabels,
  type FrameSample,
} from './scanner-evidence/detector/score';
import type { ClipLabel } from './scanner-evidence/detector/clips';

const frameWidth = 1000;
const frameHeight = 1200;
const pixelsPerMm = 5;

function cardAt(left: number, top: number): FrameLabel['corners'] {
  const right = left + 63 * pixelsPerMm;
  const bottom = top + 88 * pixelsPerMm;
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

function label(
  frame: string,
  corners: FrameLabel['corners'],
  { tiltBucket = '0', borderColor = 'black' }: Partial<Pick<FrameLabel, 'tiltBucket' | 'borderColor'>> = {},
): FrameLabel {
  return {
    frame,
    condition: corners ? 'plain' : 'empty-plain',
    scryfallId: corners ? 'card' : null,
    borderColor: corners ? borderColor : null,
    corners,
    tiltDegrees: tiltBucket === '0' ? 0 : 12,
    tiltBucket,
    intrinsicMatrix: [[950, 0, 500], [0, 950, 600], [0, 0, 1]],
  };
}

const labels: FrameLabels = {
  frameWidth,
  frameHeight,
  cardMm: [63, 88],
  frames: [label('plain-000.png', cardAt(200, 300)), label('empty-plain-000.png', null)],
  clips: [],
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

  const [plain] = run(shiftedRight).groups;

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
  expect(replayTable(comparison)).toContain(
    'plain-000.png, tilt 0, black border: outline at (200, 308) (515, 308) (515, 740) (200, 740), sides inside top 1.5 mm, right 0.0 mm',
  );
});

test('an outline less than 1 mm inside the card edge is not an inside outline', () => {
  const onTheEdge = cardAt(200, 300)!;
  const slightlyInside = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 0.8 * pixelsPerMm : y]);

  const comparison = compareReplays(run(onTheEdge), run(slightlyInside), { sameDetector: false });

  expect(bar(comparison, 'Inside outlines')).toMatchObject({ branch: '0', pass: true });
});

test('a wrong outline does not count toward the detection rate, and fails the wrong outlines bar', () => {
  const onTheEdge = cardAt(200, 300)!;
  const outsideByTwoMm = cardAt(200 - 2 * pixelsPerMm, 300)!;

  const comparison = compareReplays(run(onTheEdge), run(outsideByTwoMm), { sameDetector: false });

  expect(bar(comparison, 'Detection rate')).toMatchObject({ base: '1 of 1', branch: '0 of 1', pass: false });
  expect(bar(comparison, 'Wrong outlines')).toMatchObject({ base: '0', branch: '1', pass: false });
});

test('an outline with every corner within 1 mm of the true corners is a correct outline', () => {
  const onTheEdge = cardAt(200, 300)!;
  const offByLessThanOneMm = cardAt(200 + 0.9 * pixelsPerMm, 300)!;

  const comparison = compareReplays(run(onTheEdge), run(offByLessThanOneMm), { sameDetector: false });

  expect(bar(comparison, 'Detection rate')).toMatchObject({ branch: '1 of 1', pass: true });
  expect(bar(comparison, 'Wrong outlines')).toMatchObject({ branch: '0', pass: true });
});

test('refusing a wrong outline passes the detection rate and wrong outlines bars', () => {
  const outsideByTwoMm = cardAt(200 - 2 * pixelsPerMm, 300)!;

  const comparison = compareReplays(run(outsideByTwoMm), run(null), { sameDetector: false });

  expect(bar(comparison, 'Detection rate')).toMatchObject({ base: '0 of 1', branch: '0 of 1', pass: true });
  expect(bar(comparison, 'Wrong outlines')).toMatchObject({ base: '1', branch: '0', pass: true });
  expect(comparison.pass).toBe(true);
});

test('the inside outlines bar compares the count of each group, and still lists each new inside outline', () => {
  const onTheEdge = cardAt(200, 300)!;
  const insideAtTheTop = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 1.5 * pixelsPerMm : y]);
  const twoFrames: FrameLabels = {
    ...labels,
    frames: [label('plain-000.png', onTheEdge), label('plain-001.png', onTheEdge)],
  };
  const replay = (first: [number, number][], second: [number, number][]) =>
    scoreReplay(twoFrames, [[sample('plain-000.png', first), sample('plain-001.png', second)]]);

  const comparison = compareReplays(replay(insideAtTheTop, onTheEdge), replay(onTheEdge, insideAtTheTop), { sameDetector: false });

  expect(bar(comparison, 'Inside outlines')).toMatchObject({ base: '1', branch: '1', pass: true });
  expect(replayTable(comparison)).toContain('- plain-001.png, tilt 0, black border: outline at');
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

test('the detector replay gates each condition and tilt bucket on its own', () => {
  const onTheEdge = cardAt(200, 300)!;
  const tiltedLabels: FrameLabels = {
    ...labels,
    frames: [label('plain-000.png', onTheEdge), label('plain-030.png', onTheEdge, { tiltBucket: '7.5-15' })],
  };
  const replay = (tiltedOutline: [number, number][] | null) =>
    scoreReplay(tiltedLabels, [[sample('plain-000.png', onTheEdge), sample('plain-030.png', tiltedOutline)]]);

  const comparison = compareReplays(replay(onTheEdge), replay(null), { sameDetector: false });

  const detectionRates = comparison.bars.filter(
    (candidate) => candidate.metric === 'Detection rate' && candidate.tiltBucket !== null && candidate.borderColor === null,
  );
  expect(detectionRates).toEqual([
    expect.objectContaining({ condition: 'plain', tiltBucket: '0', branch: '1 of 1', pass: true }),
    expect.objectContaining({ condition: 'plain', tiltBucket: '7.5-15', base: '1 of 1', branch: '0 of 1', pass: false }),
  ]);
});

test('the detector replay reports inside outlines per border colour and tilt bucket', () => {
  const onTheEdge = cardAt(200, 300)!;
  const onTheInnerFrame = onTheEdge.map(([x, y]): [number, number] => [
    x + (x === 200 ? 3 : -3) * pixelsPerMm,
    y + (y === 300 ? 3 : -3) * pixelsPerMm,
  ]);
  const tiltedLabels: FrameLabels = {
    ...labels,
    frames: [
      label('plain-030.png', onTheEdge, { tiltBucket: '7.5-15', borderColor: 'black' }),
      label('plain-031.png', onTheEdge, { tiltBucket: '7.5-15', borderColor: 'white' }),
      label('plain-032.png', onTheEdge, { tiltBucket: '7.5-15', borderColor: 'black' }),
    ],
  };
  const replay = scoreReplay(tiltedLabels, [[
    sample('plain-030.png', onTheInnerFrame),
    sample('plain-031.png', onTheEdge),
    sample('plain-032.png', onTheEdge),
  ]]);

  const comparison = compareReplays(replay, replay, { sameDetector: false });

  const insideOutlines = comparison.bars.filter((candidate) => candidate.metric === 'Inside outlines' && candidate.condition === null);
  expect(insideOutlines).toEqual([
    expect.objectContaining({ borderColor: 'black', tiltBucket: '7.5-15', branch: '1', pass: null }),
    expect.objectContaining({ borderColor: 'white', tiltBucket: '7.5-15', branch: '0', pass: null }),
  ]);
});

test('the replay table has one row per condition and tilt bucket, with the merge base and the branch side by side', () => {
  const onTheEdge = cardAt(200, 300)!;
  const tiltedLabels: FrameLabels = {
    ...labels,
    frames: [
      label('plain-000.png', onTheEdge),
      label('plain-030.png', onTheEdge, { tiltBucket: '7.5-15', borderColor: 'white' }),
      label('empty-plain-000.png', null),
    ],
  };
  const replay = (tiltedOutline: [number, number][] | null) =>
    scoreReplay(tiltedLabels, [[
      sample('plain-000.png', onTheEdge),
      sample('plain-030.png', tiltedOutline),
      sample('empty-plain-000.png', null),
    ]]);

  const table = replayTable(compareReplays(replay(onTheEdge), replay(null), { sameDetector: false }));

  expect(table).toContain('| plain | 0 | 1 of 1 → 1 of 1 | 0 → 0 | 0.00 mm → 0.00 mm | 0.00 mm → 0.00 mm | 0 → 0 | 0.00 x 0.00 mm → 0.00 x 0.00 mm | pass |');
  expect(table).toContain('| plain | 7.5-15 | 1 of 1 → 0 of 1 | 0 → 0 | 0.00 mm → none | 0.00 mm → none | 0 → 0 | 0.00 x 0.00 mm → none | fail: detection rate |');
  expect(table).toContain('| empty-plain | 0 | 0 → 0 | pass |');
  expect(table).toContain('| white | 7.5-15 | 1 of 1 → 0 of 1 | 0 → 0 | 0.00 mm → none | 0.00 mm → none | 0 → 0 | 0.00 x 0.00 mm → none |');
  expect(table).toContain('- Detection rate: correct outlines not lower by more than 0');
});

test('the detector replay reports each condition per border colour', () => {
  const onTheEdge = cardAt(200, 300)!;
  const borderLabels: FrameLabels = {
    ...labels,
    frames: [
      label('plain-000.png', onTheEdge, { borderColor: 'black' }),
      label('plain-001.png', onTheEdge, { borderColor: 'borderless' }),
      label('plain-030.png', onTheEdge, { tiltBucket: '7.5-15', borderColor: 'borderless' }),
    ],
  };
  const replay = scoreReplay(borderLabels, [[
    sample('plain-000.png', onTheEdge),
    sample('plain-001.png', null),
    sample('plain-030.png', onTheEdge),
  ]]);

  const table = replayTable(compareReplays(replay, replay, { sameDetector: false }));

  expect(table).toContain('| plain | black | 1 of 1 → 1 of 1 |');
  expect(table).toContain('| plain | borderless | 1 of 2 → 1 of 2 |');
});

const clipFrames = 10;
const arrivingFrames = 3;
const photoScale = 2;

function clipLabel(clip: string, { handShiftMm = 0 }: { handShiftMm?: number } = {}): ClipLabel {
  const atRest = cardAt(200, 300)!;
  return {
    clip,
    condition: 'plain',
    scryfallId: 'card',
    borderColor: 'black',
    tiltDegrees: 0,
    tiltBucket: '0',
    restMs: arrivingFrames * 200,
    frames: Array.from({ length: clipFrames }, (_, index) => ({
      frame: `${clip}-${index}.png`,
      timeMs: index * 200,
      corners: cardAt(200 + Math.max(0, arrivingFrames - index) * 20 * pixelsPerMm, 300)!,
      intrinsicMatrix: [[950, 0, 500], [0, 950, 600], [0, 0, 1]],
    })),
    photo: {
      frame: `${clip}-photo.jpg`,
      timeMs: 1400,
      width: frameWidth * photoScale,
      height: frameHeight * photoScale,
      corners: atRest.map(([x, y]): [number, number] => [(x + handShiftMm * pixelsPerMm) * photoScale, y * photoScale]),
      intrinsicMatrix: [[1900, 0, 1000], [0, 1900, 1200], [0, 0, 1]],
    },
  };
}

function runClip(clip: ClipLabel, outlineAt: (index: number, trueCorners: [number, number][]) => [number, number][] | null) {
  return scoreReplay(
    { ...labels, clips: [clip] },
    [
      [
        sample('plain-000.png', cardAt(200, 300)),
        sample('empty-plain-000.png', null),
        ...clip.frames.map((frame, index) => sample(frame.frame, outlineAt(index, frame.corners))),
      ],
    ],
  );
}

const onTheCard = (_: number, trueCorners: [number, number][]) => trueCorners;

test('a clip asks for a photo through automatic capture once its outline holds still for 400 ms', () => {
  const [clip] = runClip(clipLabel('plain-clip-000'), onTheCard).clips;

  expect(clip).toMatchObject({ clip: 'plain-clip-000', photoAskedFor: true, settleTimeMs: 1200 });
});

test('the photo outline is the held-still outline mapped onto the photo, so hand movement before the photo shows in its error', () => {
  const [clip] = runClip(clipLabel('plain-clip-000', { handShiftMm: 2 }), onTheCard).clips;

  expect(clip.photoOutlineMm).toBeCloseTo(2);
  expect(clip.handShiftMm).toBeCloseTo(2);
});

test('the photo outline error also counts how far the held-still outline is from the card edge', () => {
  const onTheInnerFrame = (_: number, [topLeft, topRight, bottomRight, bottomLeft]: [number, number][]): [number, number][] => [
    [topLeft[0] + 3 * pixelsPerMm, topLeft[1]],
    [topRight[0] - 3 * pixelsPerMm, topRight[1]],
    [bottomRight[0] - 3 * pixelsPerMm, bottomRight[1]],
    [bottomLeft[0] + 3 * pixelsPerMm, bottomLeft[1]],
  ];

  const [clip] = runClip(clipLabel('plain-clip-000'), onTheInnerFrame).clips;

  expect(clip.photoOutlineMm).toBeCloseTo(3);
  expect(clip.handShiftMm).toBeCloseTo(0);
});

test('jitter is the spread of each corner error over the frames after the hand comes to rest', () => {
  const shaking = (index: number, trueCorners: [number, number][]) => {
    const shiftMm = index < arrivingFrames ? 10 : index % 2 === 0 ? 0.5 : -0.5;
    return trueCorners.map(([x, y]): [number, number] => [x + shiftMm * pixelsPerMm, y]);
  };

  const [clip] = runClip(clipLabel('plain-clip-000'), shaking).clips;

  expect(clip.jitterMm).toBeCloseTo(0.495, 3);
});

const everyOtherFrame = (index: number, trueCorners: [number, number][]) => (index % 2 === 0 ? trueCorners : null);
const missingTheFirstRestFrame = (index: number, trueCorners: [number, number][]) => (index === arrivingFrames ? null : trueCorners);

test('a clip that stops asking for a photo fails the photo asked for bar of its condition', () => {
  const clip = clipLabel('plain-clip-000');

  const comparison = compareReplays(runClip(clip, onTheCard), runClip(clip, everyOtherFrame), { sameDetector: false });

  expect(comparison.clipBars).toContainEqual(
    expect.objectContaining({ condition: 'plain', metric: 'Photo asked for', base: '1 of 1', branch: '0 of 1', pass: false }),
  );
  expect(comparison.pass).toBe(false);
});

test('a later settle time fails the settle time bar', () => {
  const clip = clipLabel('plain-clip-000');

  const comparison = compareReplays(runClip(clip, onTheCard), runClip(clip, missingTheFirstRestFrame), { sameDetector: false });

  expect(comparison.clipBars.filter((candidate) => candidate.pass === false)).toEqual([
    expect.objectContaining({ metric: 'Settle time median', base: '1200 ms', branch: '1400 ms' }),
  ]);
});

test('more jitter fails the jitter bar, and a photo outline more than 0.1 mm worse fails the photo outline bar', () => {
  const clip = clipLabel('plain-clip-000');
  const shifted = (shiftMm: (index: number) => number) => (index: number, trueCorners: [number, number][]) =>
    trueCorners.map(([x, y]): [number, number] => [x + shiftMm(index) * pixelsPerMm, y]);
  const steady = shifted(() => 0.2);
  const shaking = shifted((index) => (index % 2 === 0 ? 0.5 : -0.1));

  const comparison = compareReplays(runClip(clip, steady), runClip(clip, shaking), { sameDetector: false });

  expect(comparison.clipBars.filter((candidate) => candidate.pass === false).map((candidate) => candidate.metric)).toEqual([
    'Jitter median',
    'Photo outline median',
  ]);
});

test('the replay table has one row per clip condition and names each clip that stops asking for a photo', () => {
  const clip = clipLabel('plain-clip-000', { handShiftMm: 1 });

  const table = replayTable(compareReplays(runClip(clip, onTheCard), runClip(clip, everyOtherFrame), { sameDetector: false }));

  expect(table).toContain(
    '| plain | 1 of 1 → 0 of 1 | 1200 ms → none | 0.00 mm → 0.00 mm | 1.00 mm → none | 1.00 mm → none | fail: photo asked for, settle time median |',
  );
  expect(table).toContain('- Photo asked for: not fewer');
  expect(table).toContain('Clips that ask for a photo on the merge base and not on the branch: plain-clip-000');
});
