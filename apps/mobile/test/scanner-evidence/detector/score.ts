import type { DetectionSample } from '../../../modules/card-detector';
import { nearestRank } from '../../../src/scan/capture-log';

type Point = [x: number, y: number];

type Sides = { top: number; right: number; bottom: number; left: number };

export type FrameLabel = {
  frame: string;
  condition: string;
  scryfallId: string | null;
  borderColor: 'black' | 'white' | 'borderless' | null;
  corners: Point[] | null;
  tiltDegrees: number;
  intrinsicMatrix: number[][];
};

export type FrameLabels = {
  frameWidth: number;
  frameHeight: number;
  cardMm: Point;
  frames: FrameLabel[];
};

export type FrameSample = DetectionSample & { frame: string };

export type FrameScore = {
  frame: string;
  condition: string;
  hasCard: boolean;
  detected: boolean;
  outline: Point[] | null;
  cornerErrorMm: number | null;
  sidesInsideMm: Sides | null;
  sizeErrorMm: { width: number; height: number } | null;
  inside: boolean;
  nativeDurationMs: number;
};

export type ConditionScore = {
  condition: string;
  frames: number;
  cardFrames: number;
  detected: number;
  cornerErrorMm: { median: number; p90: number } | null;
  sizeErrorMm: { width: number; height: number } | null;
  insideOutlines: string[];
  falseOutlines: string[];
};

export type ReplayScore = {
  conditions: ConditionScore[];
  frames: FrameScore[];
  macP95Ms: number;
};

export type Bar = {
  condition: string | null;
  metric: string;
  base: string;
  branch: string;
  bar: string;
  pass: boolean | null;
};

export type Comparison = {
  bars: Bar[];
  failingOutlines: FrameScore[];
  pass: boolean;
};

export const insideOutlineMm = 1;
export const replayBars = {
  cornerErrorMedianMm: 0.1,
  cornerErrorP90Mm: 0.5,
  detectionDropPerFrame: 1 / 30,
  macTimingRatio: 1.2,
} as const;

function homography(from: Point[], to: Point[]) {
  const rows = from.flatMap(([x, y], index) => {
    const [u, v] = to[index];
    return [
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    ];
  });
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column] / rows[column][column];
      for (let entry = column; entry < 9; entry += 1) rows[row][entry] -= factor * rows[column][entry];
    }
  }
  const h = rows.map((row, index) => row[8] / row[index]);
  return ([x, y]: Point): Point => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function median(values: number[]) {
  return nearestRank([...values].sort((a, b) => a - b), 0.5);
}

function scoreFrame(label: FrameLabel, sample: FrameSample, labels: FrameLabels): FrameScore {
  const outline =
    sample.detected && sample.corners ? sample.corners.map(({ x, y }): Point => [x * labels.frameWidth, y * labels.frameHeight]) : null;
  const unscored = { cornerErrorMm: null, sidesInsideMm: null, sizeErrorMm: null, inside: false };
  const base = {
    frame: label.frame,
    condition: label.condition,
    hasCard: label.corners !== null,
    detected: outline !== null,
    outline,
    nativeDurationMs: sample.nativeDurationMs,
  };
  if (!outline || !label.corners) return { ...base, ...unscored };
  const [width, height] = labels.cardMm;
  const card: Point[] = [[0, 0], [width, 0], [width, height], [0, height]];
  const onCard = outline.map(homography(label.corners, card));
  const aligned = [0, 1, 2, 3]
    .map((shift) => card.map((_, corner) => onCard[(corner + shift) % 4]))
    .map((corners) => ({ corners, error: Math.max(...corners.map((corner, index) => distance(corner, card[index]))) }))
    .reduce((best, candidate) => (candidate.error < best.error ? candidate : best));
  const [topLeft, topRight, bottomRight, bottomLeft] = aligned.corners;
  const sides = {
    top: (topLeft[1] + topRight[1]) / 2,
    right: width - (topRight[0] + bottomRight[0]) / 2,
    bottom: height - (bottomRight[1] + bottomLeft[1]) / 2,
    left: (topLeft[0] + bottomLeft[0]) / 2,
  };
  return {
    ...base,
    cornerErrorMm: aligned.error,
    sidesInsideMm: sides,
    sizeErrorMm: { width: (sides.left + sides.right) / 2, height: (sides.top + sides.bottom) / 2 },
    inside: Math.max(sides.top, sides.right, sides.bottom, sides.left) > insideOutlineMm,
  };
}

function scoreCondition(condition: string, frames: FrameScore[]): ConditionScore {
  const cardFrames = frames.filter((frame) => frame.hasCard);
  const fitted = cardFrames.filter((frame) => frame.cornerErrorMm !== null && frame.sizeErrorMm !== null);
  const errors = fitted.map((frame) => frame.cornerErrorMm!).sort((a, b) => a - b);
  return {
    condition,
    frames: frames.length,
    cardFrames: cardFrames.length,
    detected: cardFrames.filter((frame) => frame.detected).length,
    cornerErrorMm: errors.length > 0 ? { median: nearestRank(errors, 0.5), p90: nearestRank(errors, 0.9) } : null,
    sizeErrorMm:
      fitted.length > 0
        ? { width: median(fitted.map((frame) => frame.sizeErrorMm!.width)), height: median(fitted.map((frame) => frame.sizeErrorMm!.height)) }
        : null,
    insideOutlines: cardFrames.filter((frame) => frame.inside).map((frame) => frame.frame),
    falseOutlines: frames.filter((frame) => !frame.hasCard && frame.detected).map((frame) => frame.frame),
  };
}

export function scoreReplay(labels: FrameLabels, samples: FrameSample[]): ReplayScore {
  const byFrame = new Map(samples.map((sample) => [sample.frame, sample]));
  const frames = labels.frames.map((label) => {
    const sample = byFrame.get(label.frame);
    if (!sample) throw new Error(`no detection sample for ${label.frame}`);
    return scoreFrame(label, sample, labels);
  });
  const conditions = [...new Set(frames.map((frame) => frame.condition))];
  return {
    conditions: conditions.map((condition) => scoreCondition(condition, frames.filter((frame) => frame.condition === condition))),
    frames,
    macP95Ms: nearestRank(frames.map((frame) => frame.nativeDurationMs).sort((a, b) => a - b), 0.95),
  };
}

const millimetres = (value: number | undefined) => (value === undefined ? 'none' : `${value.toFixed(2)} mm`);

function withoutTiming({ conditions, frames }: ReplayScore) {
  return JSON.stringify({ conditions, frames: frames.map(({ nativeDurationMs: _, ...frame }) => frame) });
}

function conditionBars(base: ConditionScore, branch: ConditionScore): Bar[] {
  const condition = branch.condition;
  if (branch.cardFrames === 0) {
    return [
      {
        condition,
        metric: 'False outlines',
        base: String(base.falseOutlines.length),
        branch: String(branch.falseOutlines.length),
        bar: 'zero',
        pass: branch.falseOutlines.length === 0,
      },
    ];
  }
  const allowedDrop = branch.cardFrames * replayBars.detectionDropPerFrame;
  const newInside = branch.insideOutlines.filter((frame) => !base.insideOutlines.includes(frame));
  const worse = (metric: 'median' | 'p90', limit: number) =>
    base.cornerErrorMm === null || branch.cornerErrorMm === null || branch.cornerErrorMm[metric] - base.cornerErrorMm[metric] <= limit;
  return [
    {
      condition,
      metric: 'Detection rate',
      base: `${base.detected} of ${base.cardFrames}`,
      branch: `${branch.detected} of ${branch.cardFrames}`,
      bar: `not lower by more than ${allowedDrop.toFixed(0)}`,
      pass: base.detected - branch.detected <= allowedDrop,
    },
    {
      condition,
      metric: 'Corner error median',
      base: millimetres(base.cornerErrorMm?.median),
      branch: millimetres(branch.cornerErrorMm?.median),
      bar: `not worse by more than ${replayBars.cornerErrorMedianMm} mm`,
      pass: worse('median', replayBars.cornerErrorMedianMm),
    },
    {
      condition,
      metric: 'Corner error p90',
      base: millimetres(base.cornerErrorMm?.p90),
      branch: millimetres(branch.cornerErrorMm?.p90),
      bar: `not worse by more than ${replayBars.cornerErrorP90Mm} mm`,
      pass: worse('p90', replayBars.cornerErrorP90Mm),
    },
    {
      condition,
      metric: 'Inside outlines',
      base: String(base.insideOutlines.length),
      branch: String(branch.insideOutlines.length),
      bar: 'no new one',
      pass: newInside.length === 0,
    },
    {
      condition,
      metric: 'Size error, width x height',
      base: base.sizeErrorMm ? `${millimetres(base.sizeErrorMm.width)} x ${millimetres(base.sizeErrorMm.height)}` : 'none',
      branch: branch.sizeErrorMm ? `${millimetres(branch.sizeErrorMm.width)} x ${millimetres(branch.sizeErrorMm.height)}` : 'none',
      bar: 'reported',
      pass: null,
    },
  ];
}

export function compareReplays(base: ReplayScore, branch: ReplayScore, { sameDetector }: { sameDetector: boolean }): Comparison {
  const bars = branch.conditions.flatMap((condition) => {
    const before = base.conditions.find((candidate) => candidate.condition === condition.condition);
    if (!before) throw new Error(`the merge base has no ${condition.condition} frames`);
    return conditionBars(before, condition);
  });
  bars.push({
    condition: null,
    metric: 'Mac timing p95',
    base: `${base.macP95Ms.toFixed(1)} ms`,
    branch: `${branch.macP95Ms.toFixed(1)} ms`,
    bar: `at most ${replayBars.macTimingRatio} times the merge base`,
    pass: branch.macP95Ms <= replayBars.macTimingRatio * base.macP95Ms,
  });
  if (sameDetector) {
    const same = withoutTiming(base) === withoutTiming(branch);
    bars.push({
      condition: null,
      metric: 'Same detector code',
      base: 'same',
      branch: same ? 'same numbers' : 'other numbers',
      bar: 'same numbers',
      pass: same,
    });
  }
  const baseInside = new Set(base.frames.filter((frame) => frame.inside).map((frame) => frame.frame));
  return {
    bars,
    failingOutlines: branch.frames.filter((frame) => (frame.inside && !baseInside.has(frame.frame)) || (!frame.hasCard && frame.detected)),
    pass: bars.every((bar) => bar.pass !== false),
  };
}

function cell(value: string | null) {
  return value ?? '';
}

export function replayTable({ bars, failingOutlines, pass }: Comparison): string {
  const rows = bars.map((bar) =>
    `| ${cell(bar.condition)} | ${bar.metric} | ${bar.base} | ${bar.branch} | ${bar.bar} | ${bar.pass === null ? '' : bar.pass ? 'pass' : 'fail'} |`,
  );
  const outlines = failingOutlines.map((frame) => {
    const corners = frame.outline!.map(([x, y]) => `(${x.toFixed(0)}, ${y.toFixed(0)})`).join(' ');
    const sides = frame.sidesInsideMm
      ? `, sides inside ${Object.entries(frame.sidesInsideMm).map(([side, value]) => `${side} ${value.toFixed(1)} mm`).join(', ')}`
      : '';
    return `- ${frame.frame}: outline at ${corners}${sides}`;
  });
  return [
    '| Condition | Metric | Merge base | Branch | Bar | Result |',
    '| --- | --- | --: | --: | --- | --- |',
    ...rows,
    '',
    pass ? 'Every bar passes.' : 'A bar failed.',
    ...(outlines.length > 0 ? ['', 'Failing outlines, in frame pixels:', '', ...outlines] : []),
    '',
  ].join('\n');
}
