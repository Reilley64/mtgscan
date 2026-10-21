import type { DetectionSample } from '../../../modules/card-detector';
import { nearestRank } from '../../../src/scan/capture-log';
import { compareClips, scoreClip, scoreClipGroups, type ClipGroupScore, type ClipLabel, type ClipScore } from './clips';
import { median, outlineOnCard, type Point } from './geometry';

type Sides = { top: number; right: number; bottom: number; left: number };

const borderColors = ['black', 'white', 'borderless'] as const;

type BorderColor = (typeof borderColors)[number];

export type FrameLabel = {
  frame: string;
  condition: string;
  scryfallId: string | null;
  borderColor: BorderColor | null;
  corners: Point[] | null;
  tiltDegrees: number;
  tiltBucket: string;
  intrinsicMatrix: number[][];
};

export type FrameLabels = {
  frameWidth: number;
  frameHeight: number;
  cardMm: Point;
  frames: FrameLabel[];
  clips: ClipLabel[];
};

export type FrameSample = DetectionSample & { frame: string };

export type FrameScore = {
  frame: string;
  condition: string;
  tiltBucket: string;
  borderColor: BorderColor | null;
  hasCard: boolean;
  detected: boolean;
  outline: Point[] | null;
  cornerErrorMm: number | null;
  sidesInsideMm: Sides | null;
  sizeErrorMm: { width: number; height: number } | null;
  inside: boolean;
  nativeDurationMs: number;
};

export type GroupScore = {
  condition: string | null;
  borderColor: BorderColor | null;
  tiltBucket: string | null;
  frames: number;
  cardFrames: number;
  detected: number;
  correct: number;
  cornerErrorMm: { median: number; p90: number } | null;
  sizeErrorMm: { width: number; height: number } | null;
  insideOutlines: string[];
  wrongOutlines: string[];
  falseOutlines: string[];
};

export type ReplayScore = {
  groups: GroupScore[];
  frames: FrameScore[];
  clips: ClipScore[];
  clipGroups: ClipGroupScore[];
  macP95Ms: number;
};

export type Bar = {
  condition: string | null;
  borderColor: BorderColor | null;
  tiltBucket: string | null;
  metric: string;
  base: string;
  branch: string;
  bar: string;
  pass: boolean | null;
};

export type Comparison = {
  bars: Bar[];
  clipBars: Bar[];
  newInsideAndFalseOutlines: FrameScore[];
  clipsWithoutPhoto: string[];
  pass: boolean;
};

export const insideOutlineMm = 1;
export const correctOutlineMm = 1;
export const replayBars = {
  cornerErrorMedianMm: 0.1,
  cornerErrorP90Mm: 0.5,
  detectionDropPerFrame: 1 / 30,
  macTimingRatio: 1.2,
} as const;

function scoreFrame(label: FrameLabel, sample: FrameSample, labels: FrameLabels): FrameScore {
  const outline =
    sample.detected && sample.corners ? sample.corners.map(({ x, y }): Point => [x * labels.frameWidth, y * labels.frameHeight]) : null;
  const unscored = { cornerErrorMm: null, sidesInsideMm: null, sizeErrorMm: null, inside: false };
  const base = {
    frame: label.frame,
    condition: label.condition,
    tiltBucket: label.tiltBucket,
    borderColor: label.borderColor,
    hasCard: label.corners !== null,
    detected: outline !== null,
    outline,
    nativeDurationMs: sample.nativeDurationMs,
  };
  if (!outline || !label.corners) return { ...base, ...unscored };
  const [width, height] = labels.cardMm;
  const aligned = outlineOnCard(outline, label.corners, labels.cardMm);
  const [topLeft, topRight, bottomRight, bottomLeft] = aligned.corners;
  const sides = {
    top: (topLeft[1] + topRight[1]) / 2,
    right: width - (topRight[0] + bottomRight[0]) / 2,
    bottom: height - (bottomRight[1] + bottomLeft[1]) / 2,
    left: (topLeft[0] + bottomLeft[0]) / 2,
  };
  return {
    ...base,
    cornerErrorMm: aligned.errorMm,
    sidesInsideMm: sides,
    sizeErrorMm: { width: (sides.left + sides.right) / 2, height: (sides.top + sides.bottom) / 2 },
    inside: Math.max(sides.top, sides.right, sides.bottom, sides.left) > insideOutlineMm,
  };
}

type GroupKey = Pick<GroupScore, 'condition' | 'borderColor' | 'tiltBucket'>;

function scoreGroup(key: GroupKey, frames: FrameScore[]): GroupScore {
  const cardFrames = frames.filter((frame) => frame.hasCard);
  const fitted = cardFrames.filter((frame) => frame.cornerErrorMm !== null && frame.sizeErrorMm !== null);
  const errors = fitted.map((frame) => frame.cornerErrorMm!).sort((a, b) => a - b);
  return {
    ...key,
    frames: frames.length,
    cardFrames: cardFrames.length,
    detected: cardFrames.filter((frame) => frame.detected).length,
    correct: fitted.filter((frame) => frame.cornerErrorMm! <= correctOutlineMm).length,
    cornerErrorMm: errors.length > 0 ? { median: nearestRank(errors, 0.5), p90: nearestRank(errors, 0.9) } : null,
    sizeErrorMm:
      fitted.length > 0
        ? { width: median(fitted.map((frame) => frame.sizeErrorMm!.width)), height: median(fitted.map((frame) => frame.sizeErrorMm!.height)) }
        : null,
    insideOutlines: cardFrames.filter((frame) => frame.inside).map((frame) => frame.frame),
    wrongOutlines: fitted.filter((frame) => frame.cornerErrorMm! > correctOutlineMm).map((frame) => frame.frame),
    falseOutlines: frames.filter((frame) => !frame.hasCard && frame.detected).map((frame) => frame.frame),
  };
}

function scoreGroups(frames: FrameScore[], keyOf: (frame: FrameScore) => GroupKey) {
  const groups = new Map<string, { key: GroupKey; frames: FrameScore[] }>();
  for (const frame of frames) {
    const key = keyOf(frame);
    const id = JSON.stringify(key);
    if (!groups.has(id)) groups.set(id, { key, frames: [] });
    groups.get(id)!.frames.push(frame);
  }
  return [...groups.values()].map((group) => scoreGroup(group.key, group.frames));
}

export function scoreReplay(labels: FrameLabels, rounds: FrameSample[][]): ReplayScore {
  const roundsByFrame = rounds.map((samples) => new Map(samples.map((sample) => [sample.frame, sample])));
  const samplesOf = (frame: string, inRounds = roundsByFrame) => {
    const samples = inRounds.map((byFrame) => byFrame.get(frame));
    if (!samples.every((sample) => sample !== undefined)) throw new Error(`no detection sample for ${frame}`);
    return samples;
  };
  const frames = labels.frames.map((label) => {
    const samples = samplesOf(label.frame);
    return { ...scoreFrame(label, samples[0], labels), nativeDurationMs: median(samples.map((sample) => sample.nativeDurationMs)) };
  });
  const clips = labels.clips.map((clip) => scoreClip(clip, clip.frames.map((frame) => samplesOf(frame.frame, roundsByFrame.slice(0, 1))[0]), labels));
  const conditions = [...new Set(frames.map((frame) => frame.condition))];
  const byBorderColor = frames
    .filter((frame) => frame.borderColor !== null)
    .sort((a, b) => borderColors.indexOf(a.borderColor!) - borderColors.indexOf(b.borderColor!));
  const byConditionAndBorderColor = [...byBorderColor].sort((a, b) => conditions.indexOf(a.condition) - conditions.indexOf(b.condition));
  return {
    groups: [
      ...scoreGroups(frames, ({ condition, tiltBucket }) => ({ condition, borderColor: null, tiltBucket })),
      ...scoreGroups(byConditionAndBorderColor, ({ condition, borderColor }) => ({ condition, borderColor, tiltBucket: null })),
      ...scoreGroups(byBorderColor, ({ borderColor, tiltBucket }) => ({ condition: null, borderColor, tiltBucket })),
    ],
    frames,
    clips,
    clipGroups: scoreClipGroups(clips),
    macP95Ms: nearestRank(frames.map((frame) => frame.nativeDurationMs).sort((a, b) => a - b), 0.95),
  };
}

const decimals = (value: number, digits = 2) => Number(value.toFixed(digits)).toFixed(digits);
const millimetres = (value: number | undefined) => (value === undefined ? 'none' : `${decimals(value)} mm`);
const sizeError = (size: GroupScore['sizeErrorMm']) => (size ? `${decimals(size.width)} x ${decimals(size.height)} mm` : 'none');

function withoutTiming({ groups, frames, clips }: ReplayScore) {
  return JSON.stringify({ groups, frames: frames.map(({ nativeDurationMs: _, ...frame }) => frame), clips });
}

function groupBars(base: GroupScore, branch: GroupScore): Bar[] {
  const key = { condition: branch.condition, borderColor: branch.borderColor, tiltBucket: branch.tiltBucket };
  const gated = branch.condition !== null && branch.tiltBucket !== null;
  if (branch.cardFrames === 0) {
    return [
      {
        ...key,
        metric: 'False outlines',
        base: String(base.falseOutlines.length),
        branch: String(branch.falseOutlines.length),
        bar: 'zero',
        pass: branch.falseOutlines.length === 0,
      },
    ];
  }
  const allowedDrop = branch.cardFrames * replayBars.detectionDropPerFrame;
  const worse = (metric: 'median' | 'p90', limit: number) =>
    base.cornerErrorMm === null || branch.cornerErrorMm === null || branch.cornerErrorMm[metric] - base.cornerErrorMm[metric] <= limit;
  const bar = (text: string, pass: boolean) => (gated ? { bar: text, pass } : { bar: 'reported', pass: null });
  return [
    {
      ...key,
      metric: 'Detection rate',
      base: `${base.correct} of ${base.cardFrames}`,
      branch: `${branch.correct} of ${branch.cardFrames}`,
      ...bar(`correct outlines not lower by more than ${allowedDrop.toFixed(0)}`, base.correct - branch.correct <= allowedDrop),
    },
    {
      ...key,
      metric: 'Wrong outlines',
      base: String(base.wrongOutlines.length),
      branch: String(branch.wrongOutlines.length),
      ...bar('not more than the merge base', branch.wrongOutlines.length <= base.wrongOutlines.length),
    },
    {
      ...key,
      metric: 'Corner error median',
      base: millimetres(base.cornerErrorMm?.median),
      branch: millimetres(branch.cornerErrorMm?.median),
      ...bar(`not worse by more than ${replayBars.cornerErrorMedianMm} mm`, worse('median', replayBars.cornerErrorMedianMm)),
    },
    {
      ...key,
      metric: 'Corner error p90',
      base: millimetres(base.cornerErrorMm?.p90),
      branch: millimetres(branch.cornerErrorMm?.p90),
      ...bar(`not worse by more than ${replayBars.cornerErrorP90Mm} mm`, worse('p90', replayBars.cornerErrorP90Mm)),
    },
    {
      ...key,
      metric: 'Inside outlines',
      base: String(base.insideOutlines.length),
      branch: String(branch.insideOutlines.length),
      ...bar('not more than the merge base', branch.insideOutlines.length <= base.insideOutlines.length),
    },
    {
      ...key,
      metric: 'Size error, width x height',
      base: sizeError(base.sizeErrorMm),
      branch: sizeError(branch.sizeErrorMm),
      bar: 'reported',
      pass: null,
    },
  ];
}

export function compareReplays(base: ReplayScore, branch: ReplayScore, { sameDetector }: { sameDetector: boolean }): Comparison {
  const bars = branch.groups.flatMap((group) => {
    const before = base.groups.find(
      (candidate) =>
        candidate.condition === group.condition && candidate.borderColor === group.borderColor && candidate.tiltBucket === group.tiltBucket,
    );
    if (!before) throw new Error(`the merge base has no frames for ${group.condition ?? group.borderColor} at tilt ${group.tiltBucket}`);
    return groupBars(before, group);
  });
  const run = { condition: null, borderColor: null, tiltBucket: null };
  bars.push({
    ...run,
    metric: 'Mac timing p95',
    base: `${base.macP95Ms.toFixed(1)} ms`,
    branch: `${branch.macP95Ms.toFixed(1)} ms`,
    bar: `at most ${replayBars.macTimingRatio} times the merge base`,
    pass: branch.macP95Ms <= replayBars.macTimingRatio * base.macP95Ms,
  });
  if (sameDetector) {
    const same = withoutTiming(base) === withoutTiming(branch);
    bars.push({
      ...run,
      metric: 'Same detector code',
      base: 'same',
      branch: same ? 'same numbers' : 'other numbers',
      bar: 'same numbers',
      pass: same,
    });
  }
  const clipBars = compareClips(base.clipGroups, branch.clipGroups);
  const branchPhotos = new Set(branch.clips.filter((clip) => clip.photoAskedFor).map((clip) => clip.clip));
  const baseInside = new Set(base.frames.filter((frame) => frame.inside).map((frame) => frame.frame));
  return {
    bars,
    clipBars,
    newInsideAndFalseOutlines: branch.frames.filter((frame) => (frame.inside && !baseInside.has(frame.frame)) || (!frame.hasCard && frame.detected)),
    clipsWithoutPhoto: base.clips.filter((clip) => clip.photoAskedFor && !branchPhotos.has(clip.clip)).map((clip) => clip.clip),
    pass: [...bars, ...clipBars].every((bar) => bar.pass !== false),
  };
}

const groupMetrics = ['Detection rate', 'Wrong outlines', 'Corner error median', 'Corner error p90', 'Inside outlines', 'Size error, width x height'];

function groupRows(bars: Bar[], withResult: boolean) {
  const groups = new Map<string, Bar[]>();
  for (const bar of bars) {
    const id = [bar.condition, bar.borderColor, bar.tiltBucket].filter((value) => value !== null).join(' | ');
    groups.set(id, [...(groups.get(id) ?? []), bar]);
  }
  return [...groups].map(([id, group]) => {
    const cells = group.map((bar) => `${bar.base} → ${bar.branch}`);
    const failed = group.filter((bar) => bar.pass === false).map((bar) => bar.metric.toLowerCase());
    const result = failed.length > 0 ? `fail: ${failed.join(', ')}` : 'pass';
    return `| ${id} | ${cells.join(' | ')} |${withResult ? ` ${result} |` : ''}`;
  });
}

function listedOutline(frame: FrameScore) {
  const corners = frame.outline!.map(([x, y]) => `(${x.toFixed(0)}, ${y.toFixed(0)})`).join(' ');
  const sides = frame.sidesInsideMm
    ? `, sides inside ${Object.entries(frame.sidesInsideMm).map(([side, value]) => `${side} ${decimals(value, 1)} mm`).join(', ')}`
    : '';
  const card = frame.borderColor ? `, ${frame.borderColor} border` : '';
  return `- ${frame.frame}, tilt ${frame.tiltBucket}${card}: outline at ${corners}${sides}`;
}

export function replayTable({ bars, clipBars, newInsideAndFalseOutlines, clipsWithoutPhoto, pass }: Comparison): string {
  const grouped = bars.filter((bar) => bar.metric !== 'False outlines' && (bar.condition ?? bar.borderColor) !== null);
  const byConditionAndTilt = grouped.filter((bar) => bar.condition !== null && bar.tiltBucket !== null);
  const empty = bars.filter((bar) => bar.metric === 'False outlines');
  const run = bars.filter((bar) => bar.condition === null && bar.borderColor === null);
  const gatedBars = [...new Set([...byConditionAndTilt, ...empty].filter((bar) => bar.pass !== null).map((bar) => `- ${bar.metric}: ${bar.bar}`))];
  const metricColumns = groupMetrics.join(' | ');
  const reportedTable = (title: string, columns: string, rows: Bar[]) => [
    title,
    '',
    `| ${columns} | ${metricColumns} |`,
    '| --- | --- | --: | --: | --: | --: | --: | --: |',
    ...groupRows(rows, false),
    '',
  ];
  return [
    'Card frames by condition and tilt in degrees, merge base → branch:',
    '',
    `| Condition | Tilt | ${metricColumns} | Result |`,
    '| --- | --- | --: | --: | --: | --: | --: | --: | --- |',
    ...groupRows(byConditionAndTilt, true),
    '',
    'Empty frames:',
    '',
    '| Condition | Tilt | False outlines | Result |',
    '| --- | --- | --: | --- |',
    ...groupRows(empty, true),
    '',
    'Clips by condition, merge base → branch:',
    '',
    `| Condition | ${[...new Set(clipBars.map((bar) => bar.metric))].join(' | ')} | Result |`,
    '| --- | --: | --: | --: | --: | --: | --- |',
    ...groupRows(clipBars, true),
    '',
    ...reportedTable(
      'Card frames by condition and border colour, reported:',
      'Condition | Border colour',
      grouped.filter((bar) => bar.condition !== null && bar.borderColor !== null),
    ),
    ...reportedTable(
      'Card frames by border colour and tilt, reported:',
      'Border colour | Tilt',
      grouped.filter((bar) => bar.condition === null),
    ),
    'The whole run:',
    '',
    '| Metric | Merge base | Branch | Bar | Result |',
    '| --- | --: | --: | --- | --- |',
    ...run.map((bar) => `| ${bar.metric} | ${bar.base} | ${bar.branch} | ${bar.bar} | ${bar.pass ? 'pass' : 'fail'} |`),
    '',
    'Bars for each condition and tilt:',
    '',
    ...gatedBars,
    '',
    'Bars for each clip condition:',
    '',
    ...[...new Set(clipBars.filter((bar) => bar.pass !== null).map((bar) => `- ${bar.metric}: ${bar.bar}`))],
    '',
    pass ? 'Every bar passes.' : 'A bar failed.',
    ...(newInsideAndFalseOutlines.length > 0
      ? ['', 'New inside outlines and false outlines, in frame pixels:', '', ...newInsideAndFalseOutlines.map(listedOutline)]
      : []),
    ...(clipsWithoutPhoto.length > 0 ? ['', `Clips that ask for a photo on the merge base and not on the branch: ${clipsWithoutPhoto.join(', ')}`] : []),
    '',
  ].join('\n');
}
