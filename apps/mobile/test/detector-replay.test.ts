import type { FrameQuad } from '../modules/card-detector';
import {
  branchAloneTable,
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

  const replay = run(shiftedRight);
  const [plain] = replay.groups;

  expect(plain.detected).toBe(1);
  expect(replay.frames[0].cornerErrorMm).toBeCloseTo(2);
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

test('the table lists each frame that loses its correct outline and each new wrong outline, with where the outline was', () => {
  const onTheEdge = cardAt(200, 300)!;
  const outsideByTwoMm = cardAt(200 - 2 * pixelsPerMm, 300)!;

  const wrong = replayTable(compareReplays(run(onTheEdge), run(outsideByTwoMm), { sameDetector: false }));
  const missing = replayTable(compareReplays(run(onTheEdge), run(null), { sameDetector: false }));

  const outline = '- plain-000.png, tilt 0, black border: outline at (190, 300) (505, 300) (505, 740) (190, 740)';
  expect(wrong).toContain(`plain | 0, detection rate:\n\n${outline}`);
  expect(wrong).toContain(`plain | 0, wrong outlines:\n\n${outline}`);
  expect(wrong).toContain('corner error 2.00 mm');
  expect(missing).toContain('plain | 0, detection rate:\n\n- plain-000.png, tilt 0, black border: no outline');
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

test('corner error counts correct outlines only, so a wrong outline that gets worse does not move it', () => {
  const twoFrames: FrameLabels = {
    ...labels,
    frames: [label('plain-000.png', cardAt(200, 300)), label('plain-001.png', cardAt(200, 300))],
  };
  const replay = (wrongByMm: number) =>
    scoreReplay(twoFrames, [[
      sample('plain-000.png', cardAt(200 + 0.2 * pixelsPerMm, 300)),
      sample('plain-001.png', cardAt(200 - wrongByMm * pixelsPerMm, 300)),
    ]]);

  const comparison = compareReplays(replay(4), replay(8), { sameDetector: false });

  expect(bar(comparison, 'Corner error median')).toMatchObject({ base: '0.20 mm', branch: '0.20 mm' });
  expect(bar(comparison, 'Corner error p90')).toMatchObject({ base: '0.20 mm', branch: '0.20 mm' });
  expect(bar(comparison, 'Wrong outlines')).toMatchObject({ base: '1', branch: '1', pass: true });
});

function framesOffBy(offsetsMm: number[]) {
  const frames = offsetsMm.map((_, index) => `plain-${String(index).padStart(3, '0')}.png`);
  return { frames, labels: { ...labels, frames: frames.map((frame) => label(frame, cardAt(200, 300))) } };
}

function runOffBy(offsetsMm: number[]) {
  const { frames, labels: offLabels } = framesOffBy(offsetsMm);
  return scoreReplay(offLabels, [frames.map((frame, index) => sample(frame, cardAt(200 - offsetsMm[index] * pixelsPerMm, 300)))]);
}

const tenTimes = (offsetMm: number) => Array.from({ length: 10 }, () => offsetMm);

test('corner error bars compare frames with a correct outline on both sides, so a wrong outline turning correct does not fail them', () => {
  const comparison = compareReplays(runOffBy([...tenTimes(0.05), 3, 3]), runOffBy([...tenTimes(0.05), 0.71, 0.71]), {
    sameDetector: false,
  });

  expect(bar(comparison, 'Corner error p90')).toMatchObject({ base: '0.05 mm', branch: '0.71 mm', pass: true });
  expect(bar(comparison, 'Corner error median')).toMatchObject({ pass: true });
});

test('a correct outline that gets worse on the branch fails the corner error bars', () => {
  const comparison = compareReplays(runOffBy(tenTimes(0.05)), runOffBy(tenTimes(0.95)), { sameDetector: false });

  expect(bar(comparison, 'Corner error median')).toMatchObject({ base: '0.05 mm', branch: '0.95 mm', pass: false });
  expect(bar(comparison, 'Corner error p90')).toMatchObject({ pass: false });
});

test('the corner error bars apply from 10 frames with a correct outline on both sides, and smaller groups are reported', () => {
  const rise = (frames: number) => compareReplays(runOffBy(Array(frames).fill(0.1)), runOffBy(Array(frames).fill(0.25)), { sameDetector: false });

  expect(bar(rise(3), 'Corner error median')).toMatchObject({ base: '0.10 mm', branch: '0.25 mm', bar: 'reported', pass: null });
  expect(rise(3).pass).toBe(true);
  expect(bar(rise(10), 'Corner error median')).toMatchObject({ base: '0.10 mm', branch: '0.25 mm', pass: false });
});

test('the inside outlines bar allows 1 more inside outline in 30 frames than the merge base, and lists it', () => {
  const onTheEdge = cardAt(200, 300)!;
  const insideAtTheTop = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 1.5 * pixelsPerMm : y]);
  const frames = Array.from({ length: 30 }, (_, index) => `plain-${String(index).padStart(3, '0')}.png`);
  const thirtyFrames: FrameLabels = { ...labels, frames: frames.map((frame) => label(frame, onTheEdge)) };
  const replay = (insideFrames: number) =>
    scoreReplay(thirtyFrames, [frames.map((frame, index) => sample(frame, index < insideFrames ? insideAtTheTop : onTheEdge))]);

  const oneMore = compareReplays(replay(0), replay(1), { sameDetector: false });
  const twoMore = compareReplays(replay(0), replay(2), { sameDetector: false });

  expect(bar(oneMore, 'Inside outlines')).toMatchObject({ base: '0', branch: '1', bar: 'not more than the merge base plus 1', pass: true });
  expect(replayTable(oneMore)).toContain('- plain-000.png, tilt 0, black border: outline at');
  expect(bar(twoMore, 'Inside outlines')).toMatchObject({ branch: '2', pass: false });
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

test('the detector replay reports inside outlines per border color and tilt bucket', () => {
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

test('the detector replay reports each condition per border color', () => {
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

function runClip(
  clip: ClipLabel,
  outlineAt: (index: number, trueCorners: [number, number][]) => [number, number][] | null,
  photoOutlines?: Map<string, FrameQuad>,
) {
  return scoreReplay(
    { ...labels, clips: [clip] },
    [
      [
        sample('plain-000.png', cardAt(200, 300)),
        sample('empty-plain-000.png', null),
        ...clip.frames.map((frame, index) => sample(frame.frame, outlineAt(index, frame.corners))),
      ],
    ],
    photoOutlines,
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

test('the photo outline is the refined photo outline when the detector command refines one', () => {
  const clip = clipLabel('plain-clip-000', { handShiftMm: 2 });
  const onThePhotoCard = clip.photo.corners.map(([x, y]) => ({ x: x / clip.photo.width, y: y / clip.photo.height })) as FrameQuad;

  const [refined] = runClip(clip, onTheCard, new Map([[clip.clip, onThePhotoCard]])).clips;

  expect(refined.photoOutlineMm).toBeCloseTo(0);
  expect(refined.handShiftMm).toBeCloseTo(2);
});

test('a photo outline median over all clips of 0.5 mm or more fails the photo outline bar, and lists the clips at 0.5 mm or more', () => {
  const clip = clipLabel('plain-clip-000', { handShiftMm: 0.6 });

  const comparison = compareReplays(runClip(clip, onTheCard), runClip(clip, onTheCard), { sameDetector: false });

  expect(bar(comparison, 'Photo outline median, all clips')).toMatchObject({ branch: '0.60 mm', bar: 'below 0.5 mm', pass: false });
  expect(comparison.clipBars).toContainEqual(expect.objectContaining({ metric: 'Photo outline median', branch: '0.60 mm', pass: null }));
  expect(replayTable(comparison)).toContain('photo outline median, all clips:\n\n- plain-clip-000: photo outline at (400, 600)');
});

test('the photo outline bar pools the clips of every condition', () => {
  const steady = clipLabel('plain-clip-000');
  const shifted = { ...clipLabel('sleeve-clip-000', { handShiftMm: 0.6 }), condition: 'sleeve' as const };
  const replay = (clips: ClipLabel[]) =>
    scoreReplay(
      { ...labels, clips },
      [[
        sample('plain-000.png', cardAt(200, 300)),
        sample('empty-plain-000.png', null),
        ...clips.flatMap((clip) => clip.frames.map((frame) => sample(frame.frame, frame.corners))),
      ]],
    );

  const comparison = compareReplays(replay([steady, shifted, clipLabel('plain-clip-001')]), replay([steady, shifted, clipLabel('plain-clip-001')]), {
    sameDetector: false,
  });

  expect(bar(comparison, 'Photo outline median, all clips')).toMatchObject({ branch: '0.00 mm', pass: true });
});

test('a new photo outline more than 1 mm inside the card edge fails the inside photo outlines bar', () => {
  const clip = clipLabel('plain-clip-000');
  const toPhoto = (corners: [number, number][]) => corners.map(([x, y]) => ({ x: x / clip.photo.width, y: y / clip.photo.height })) as FrameQuad;
  const onTheInnerFrame = clip.photo.corners.map(([x, y]): [number, number] => [x + (x === 400 ? 3 : -3) * pixelsPerMm * photoScale, y]);

  const comparison = compareReplays(
    runClip(clip, onTheCard, new Map([[clip.clip, toPhoto(clip.photo.corners)]])),
    runClip(clip, onTheCard, new Map([[clip.clip, toPhoto(onTheInnerFrame)]])),
    { sameDetector: false },
  );

  expect(comparison.clipBars).toContainEqual(
    expect.objectContaining({ metric: 'Inside photo outlines', base: '0', branch: '1', bar: 'no new one', pass: false }),
  );
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

test('more jitter fails the jitter bar, and the table lists the clip', () => {
  const clip = clipLabel('plain-clip-000');
  const shifted = (shiftMm: (index: number) => number) => (index: number, trueCorners: [number, number][]) =>
    trueCorners.map(([x, y]): [number, number] => [x + shiftMm(index) * pixelsPerMm, y]);
  const steady = shifted(() => 0.2);
  const shaking = shifted((index) => (index % 2 === 0 ? 0.3 : 0.1));

  const comparison = compareReplays(runClip(clip, steady), runClip(clip, shaking), { sameDetector: false });

  expect(comparison.clipBars.filter((candidate) => candidate.pass === false).map((candidate) => candidate.metric)).toEqual(['Jitter median']);
  expect(replayTable(comparison)).toContain('plain, jitter median:\n\n- plain-clip-000: photo outline at');
});

test('the replay table has one row per clip condition and names each clip that stops asking for a photo', () => {
  const clip = clipLabel('plain-clip-000', { handShiftMm: 1 });

  const table = replayTable(compareReplays(runClip(clip, onTheCard), runClip(clip, everyOtherFrame), { sameDetector: false }));

  expect(table).toContain(
    '| plain | 1 of 1 → 0 of 1 | 1200 ms → none | 0.00 mm → 0.00 mm | 1.00 mm → none | 0 → 0 | 1.00 mm → none | fail: photo asked for, settle time median |',
  );
  expect(table).toContain('- Photo asked for: not fewer');
  expect(table).toContain('Clips that ask for a photo on the merge base and not on the branch: plain-clip-000');
});

test('a branch with no merge base replay passes the fixed limits with no false outline, 1 inside outline on plain frames at no tilt, and a Mac p95 below 20 ms', () => {
  const onTheEdge = cardAt(200, 300)!;
  const insideAtTheTop = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 1.5 * pixelsPerMm : y]);

  const { table, pass } = branchAloneTable(run(insideAtTheTop, null, [19.9]));

  expect(pass).toBe(true);
  expect(table).toContain('| plain | 0 | 0 of 1 | 1 | none | none | 1 | 0.00 x 0.75 mm |');
  expect(table).toContain('| False outlines | 0 | zero | pass |');
  expect(table).toContain('| Mac timing p95 | 19.9 ms | below 20 ms | pass |');
});

test('a false outline, a second inside outline on plain frames at no tilt, or a Mac p95 of 20 ms fails the fixed limits', () => {
  const onTheEdge = cardAt(200, 300)!;
  const insideAtTheTop = onTheEdge.map(([x, y], index): [number, number] => [x, index < 2 ? y + 1.5 * pixelsPerMm : y]);
  const twoFrames: FrameLabels = { ...labels, frames: [label('plain-000.png', onTheEdge), label('plain-001.png', onTheEdge)] };
  const twoInside = scoreReplay(twoFrames, [[sample('plain-000.png', insideAtTheTop), sample('plain-001.png', insideAtTheTop)]]);

  const falseOutline = branchAloneTable(run(onTheEdge, cardAt(400, 500)));

  expect(falseOutline.pass).toBe(false);
  expect(falseOutline.table).toContain('false outlines:\n\n- empty-plain-000.png, tilt 0: outline at (400, 500)');
  expect(branchAloneTable(twoInside)).toMatchObject({ pass: false });
  expect(branchAloneTable(twoInside).table).toContain('plain | 0, inside outlines:\n\n- plain-000.png');
  expect(branchAloneTable(run(onTheEdge, null, [20])).pass).toBe(false);
});
