import type { DetectionSample, FrameQuad } from '../../../modules/card-detector';
import { nearestRank } from '../../../src/scan/capture-log';
import {
  compareClips,
  photoOutlineBar,
  scoreClip,
  scoreClipGroups,
  type ClipGroupScore,
  type ClipLabel,
  type ClipScore,
} from './clips';
import { decimals, inPixels, isInside, median, millimetres, outlineOnCard, sidesInsideMm, type Point, type Sides } from './geometry';

export const conditions = ['plain', 'patterned', 'shadow', 'sleeve', 'glare', 'motion-blur', 'hand', 'empty-plain', 'empty-patterned'] as const;
export const tiltBuckets = ['0', '0-7.5', '7.5-15', '15-25'] as const;
export const borderColors = ['black', 'white', 'borderless'] as const;

export type Condition = (typeof conditions)[number];
export type TiltBucket = (typeof tiltBuckets)[number];
export type BorderColor = (typeof borderColors)[number];

export type FrameLabel = {
  frame: string;
  condition: Condition;
  scryfallId: string | null;
  borderColor: BorderColor | null;
  corners: Point[] | null;
  tiltDegrees: number;
  tiltBucket: TiltBucket;
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
  condition: Condition;
  tiltBucket: TiltBucket;
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

type GroupKey = { condition: Condition | null; borderColor: BorderColor | null; tiltBucket: TiltBucket | null };

export type GroupScore = GroupKey & {
  frames: number;
  cardFrames: number;
  detected: number;
  correct: number;
  correctOutlinesMm: Record<string, number>;
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

export type Bar = GroupKey & {
  metric: string;
  base: string;
  branch: string;
  bar: string;
  pass: boolean | null;
  listed: string[];
};

export type Comparison = {
  bars: Bar[];
  clipBars: Bar[];
  frames: FrameScore[];
  clips: ClipScore[];
  newInsideAndFalseOutlines: FrameScore[];
  clipsWithoutPhoto: string[];
  pass: boolean;
};

export const correctOutlineMm = 1;

export const replayBars = {
  cornerErrorMedianMm: 0.1,
  cornerErrorP90Mm: 0.5,
  frameAllowance: 1 / 30,
  minimumPairedFrames: 10,
  macTimingRatio: 1.2,
} as const;

export const metrics = {
  detectionRate: 'Detection rate',
  wrongOutlines: 'Wrong outlines',
  cornerErrorMedian: 'Corner error median',
  cornerErrorP90: 'Corner error p90',
  insideOutlines: 'Inside outlines',
  sizeError: 'Size error, width x height',
  falseOutlines: 'False outlines',
  macTiming: 'Mac timing p95',
  sameDetector: 'Same detector code',
} as const;

const groupMetrics = [
  metrics.detectionRate,
  metrics.wrongOutlines,
  metrics.cornerErrorMedian,
  metrics.cornerErrorP90,
  metrics.insideOutlines,
  metrics.sizeError,
];

const wholeRun = { condition: null, borderColor: null, tiltBucket: null };

function scoreFrame(label: FrameLabel, sample: FrameSample, labels: FrameLabels): FrameScore {
  const outline = sample.detected && sample.corners ? inPixels(sample.corners, labels.frameWidth, labels.frameHeight) : null;
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
  const aligned = outlineOnCard(outline, label.corners, labels.cardMm);
  const sides = sidesInsideMm(aligned.corners, labels.cardMm);
  return {
    ...base,
    cornerErrorMm: aligned.errorMm,
    sidesInsideMm: sides,
    sizeErrorMm: { width: (sides.left + sides.right) / 2, height: (sides.top + sides.bottom) / 2 },
    inside: isInside(sides),
  };
}

function scoreGroup(key: GroupKey, frames: FrameScore[]): GroupScore {
  const cardFrames = frames.filter((frame) => frame.hasCard);
  const fitted = cardFrames.filter((frame) => frame.cornerErrorMm !== null && frame.sizeErrorMm !== null);
  const correctOutlines = fitted.filter((frame) => frame.cornerErrorMm! <= correctOutlineMm);
  const errors = correctOutlines.map((frame) => frame.cornerErrorMm!).sort((a, b) => a - b);
  return {
    ...key,
    frames: frames.length,
    cardFrames: cardFrames.length,
    detected: cardFrames.filter((frame) => frame.detected).length,
    correct: errors.length,
    correctOutlinesMm: Object.fromEntries(correctOutlines.map((frame) => [frame.frame, frame.cornerErrorMm!])),
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

export function scoreReplay(labels: FrameLabels, rounds: FrameSample[][], photoOutlines = new Map<string, FrameQuad>()): ReplayScore {
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
  const clips = labels.clips.map((clip) =>
    scoreClip(clip, clip.frames.map((frame) => samplesOf(frame.frame, roundsByFrame.slice(0, 1))[0]), labels, photoOutlines.get(clip.clip)),
  );
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

const sizeError = (size: GroupScore['sizeErrorMm']) => (size ? `${decimals(size.width)} x ${decimals(size.height)} mm` : 'none');

function withoutTiming({ nativeDurationMs: _, ...frame }: FrameScore) {
  return JSON.stringify(frame);
}

function groupBars(base: GroupScore, branch: GroupScore): Bar[] {
  const key = { condition: branch.condition, borderColor: branch.borderColor, tiltBucket: branch.tiltBucket };
  const gated = branch.condition !== null && branch.tiltBucket !== null;
  if (branch.cardFrames === 0) {
    return [
      {
        ...key,
        metric: metrics.falseOutlines,
        base: String(base.falseOutlines.length),
        branch: String(branch.falseOutlines.length),
        bar: 'zero',
        pass: branch.falseOutlines.length === 0,
        listed: branch.falseOutlines,
      },
    ];
  }
  const allowance = branch.cardFrames * replayBars.frameAllowance;
  const paired = Object.keys(branch.correctOutlinesMm).filter((frame) => frame in base.correctOutlinesMm);
  const pairedErrors = (side: GroupScore) => paired.map((frame) => side.correctOutlinesMm[frame]).sort((a, b) => a - b);
  const worse = (fraction: number, limit: number) =>
    nearestRank(pairedErrors(branch), fraction) - nearestRank(pairedErrors(base), fraction) <= limit;
  const worsePairs = (limit: number) => paired.filter((frame) => branch.correctOutlinesMm[frame] - base.correctOutlinesMm[frame] > limit);
  const reported = { bar: 'reported', pass: null, listed: [] };
  const bar = (text: string, pass: boolean, listed: string[]) => (gated ? { bar: text, pass, listed } : reported);
  const cornerErrorBar = (text: string, pass: boolean, listed: string[]) =>
    paired.length >= replayBars.minimumPairedFrames ? bar(text, pass, listed) : reported;
  const newOf = (before: string[], after: string[]) => after.filter((frame) => !before.includes(frame));
  return [
    {
      ...key,
      metric: metrics.detectionRate,
      base: `${base.correct} of ${base.cardFrames}`,
      branch: `${branch.correct} of ${branch.cardFrames}`,
      ...bar(
        `correct outlines not lower by more than ${allowance.toFixed(0)}`,
        base.correct - branch.correct <= allowance,
        newOf(Object.keys(branch.correctOutlinesMm), Object.keys(base.correctOutlinesMm)),
      ),
    },
    {
      ...key,
      metric: metrics.wrongOutlines,
      base: String(base.wrongOutlines.length),
      branch: String(branch.wrongOutlines.length),
      ...bar('not more than the merge base', branch.wrongOutlines.length <= base.wrongOutlines.length, newOf(base.wrongOutlines, branch.wrongOutlines)),
    },
    {
      ...key,
      metric: metrics.cornerErrorMedian,
      base: millimetres(base.cornerErrorMm?.median ?? null),
      branch: millimetres(branch.cornerErrorMm?.median ?? null),
      ...cornerErrorBar(
        `not worse by more than ${replayBars.cornerErrorMedianMm} mm, on frames with a correct outline on both sides`,
        worse(0.5, replayBars.cornerErrorMedianMm),
        worsePairs(replayBars.cornerErrorMedianMm),
      ),
    },
    {
      ...key,
      metric: metrics.cornerErrorP90,
      base: millimetres(base.cornerErrorMm?.p90 ?? null),
      branch: millimetres(branch.cornerErrorMm?.p90 ?? null),
      ...cornerErrorBar(
        `not worse by more than ${replayBars.cornerErrorP90Mm} mm, on frames with a correct outline on both sides`,
        worse(0.9, replayBars.cornerErrorP90Mm),
        worsePairs(replayBars.cornerErrorP90Mm),
      ),
    },
    {
      ...key,
      metric: metrics.insideOutlines,
      base: String(base.insideOutlines.length),
      branch: String(branch.insideOutlines.length),
      ...bar(
        `not more than the merge base plus ${allowance.toFixed(0)}`,
        branch.insideOutlines.length <= base.insideOutlines.length + allowance,
        newOf(base.insideOutlines, branch.insideOutlines),
      ),
    },
    {
      ...key,
      metric: metrics.sizeError,
      base: sizeError(base.sizeErrorMm),
      branch: sizeError(branch.sizeErrorMm),
      ...reported,
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
  bars.push({
    ...wholeRun,
    metric: metrics.macTiming,
    base: `${base.macP95Ms.toFixed(1)} ms`,
    branch: `${branch.macP95Ms.toFixed(1)} ms`,
    bar: `at most ${replayBars.macTimingRatio} times the merge base`,
    pass: branch.macP95Ms <= replayBars.macTimingRatio * base.macP95Ms,
    listed: [],
  });
  if (sameDetector) {
    const baseFrames = new Map(base.frames.map((frame) => [frame.frame, withoutTiming(frame)]));
    const otherFrames = branch.frames.filter((frame) => baseFrames.get(frame.frame) !== withoutTiming(frame)).map((frame) => frame.frame);
    const otherClips = branch.clips
      .filter((clip, index) => JSON.stringify(clip) !== JSON.stringify(base.clips[index]))
      .map((clip) => clip.clip);
    const same = otherFrames.length === 0 && otherClips.length === 0;
    bars.push({
      ...wholeRun,
      metric: metrics.sameDetector,
      base: 'same',
      branch: same ? 'same numbers' : 'other numbers',
      bar: 'same numbers',
      pass: same,
      listed: [...otherFrames, ...otherClips],
    });
  }
  bars.push(photoOutlineBar(base.clips, branch.clips));
  const clipBars = compareClips(base, branch);
  const branchPhotos = new Set(branch.clips.filter((clip) => clip.photoAskedFor).map((clip) => clip.clip));
  const baseInside = new Set(base.frames.filter((frame) => frame.inside).map((frame) => frame.frame));
  return {
    bars,
    clipBars,
    frames: branch.frames,
    clips: branch.clips,
    newInsideAndFalseOutlines: branch.frames.filter((frame) => (frame.inside && !baseInside.has(frame.frame)) || (!frame.hasCard && frame.detected)),
    clipsWithoutPhoto: base.clips.filter((clip) => clip.photoAskedFor && !branchPhotos.has(clip.clip)).map((clip) => clip.clip),
    pass: [...bars, ...clipBars].every((bar) => bar.pass !== false),
  };
}

export const branchAloneLimits = {
  plainInsideOutlinesAtNoTilt: 1,
} as const;

export function branchAloneBars(branch: ReplayScore): Bar[] {
  const falseOutlines = branch.frames.filter((frame) => !frame.hasCard && frame.detected).map((frame) => frame.frame);
  const plainAtNoTilt = branch.groups.find((group) => group.condition === 'plain' && group.tiltBucket === '0' && group.borderColor === null);
  const plainInside = plainAtNoTilt?.insideOutlines ?? [];
  const limits = branchAloneLimits;
  return [
    {
      ...wholeRun,
      metric: metrics.falseOutlines,
      base: 'none',
      branch: String(falseOutlines.length),
      bar: 'zero',
      pass: falseOutlines.length === 0,
      listed: falseOutlines,
    },
    {
      ...wholeRun,
      condition: 'plain',
      tiltBucket: '0',
      metric: metrics.insideOutlines,
      base: 'none',
      branch: String(plainInside.length),
      bar: `at most ${limits.plainInsideOutlinesAtNoTilt}, the one in the merge base table`,
      pass: plainInside.length <= limits.plainInsideOutlinesAtNoTilt,
      listed: plainInside,
    },
  ];
}

function groupRows(bars: Bar[], { withResult, cell }: { withResult: boolean; cell: (bar: Bar) => string }) {
  const groups = new Map<string, Bar[]>();
  for (const bar of bars) {
    const id = [bar.condition, bar.borderColor, bar.tiltBucket].filter((value) => value !== null).join(' | ');
    groups.set(id, [...(groups.get(id) ?? []), bar]);
  }
  return [...groups].map(([id, group]) => {
    const cells = group.map(cell);
    const failed = group.filter((bar) => bar.pass === false).map((bar) => bar.metric.toLowerCase());
    const result = failed.length > 0 ? `fail: ${failed.join(', ')}` : 'pass';
    return `| ${id} | ${cells.join(' | ')} |${withResult ? ` ${result} |` : ''}`;
  });
}

const corners = (outline: Point[]) => outline.map(([x, y]) => `(${x.toFixed(0)}, ${y.toFixed(0)})`).join(' ');

function listedOutline(frame: FrameScore) {
  const card = frame.borderColor ? `, ${frame.borderColor} border` : '';
  if (!frame.outline) return `- ${frame.frame}, tilt ${frame.tiltBucket}${card}: no outline`;
  const sides = frame.sidesInsideMm
    ? `, sides inside ${Object.entries(frame.sidesInsideMm).map(([side, value]) => `${side} ${decimals(value, 1)} mm`).join(', ')}`
    : '';
  const error = frame.cornerErrorMm === null ? '' : `, corner error ${millimetres(frame.cornerErrorMm)}`;
  return `- ${frame.frame}, tilt ${frame.tiltBucket}${card}: outline at ${corners(frame.outline)}${sides}${error}`;
}

function listedClip(clip: ClipScore) {
  if (!clip.photoOutline) return `- ${clip.clip}: no photo asked for`;
  const jitter = clip.jitterMm === null ? '' : `, jitter ${millimetres(clip.jitterMm)}`;
  return `- ${clip.clip}: photo outline at ${corners(clip.photoOutline)} on the photo, corner error ${millimetres(clip.photoOutlineMm)}, settle time ${clip.settleTimeMs} ms${jitter}`;
}

function failingLines(bars: Bar[], frames: FrameScore[], clips: ClipScore[]) {
  const byFrame = new Map(frames.map((frame) => [frame.frame, frame]));
  const byClip = new Map(clips.map((clip) => [clip.clip, clip]));
  const failing = bars.filter((bar) => bar.pass === false && bar.listed.length > 0);
  if (failing.length === 0) return [];
  return [
    '',
    'Frames and clips behind each failing bar, outlines in frame or photo pixels:',
    ...failing.flatMap((bar) => {
      const group = [bar.condition, bar.borderColor, bar.tiltBucket].filter((value) => value !== null).join(' | ');
      return [
        '',
        `${group ? `${group}, ` : ''}${bar.metric.toLowerCase()}:`,
        '',
        ...bar.listed.map((name) => {
          const frame = byFrame.get(name);
          return frame ? listedOutline(frame) : listedClip(byClip.get(name)!);
        }),
      ];
    }),
  ];
}

const sideBySide = (bar: Bar) => `${bar.base} → ${bar.branch}`;
const branchOnly = (bar: Bar) => bar.branch;

function tables(
  bars: Bar[],
  clipBars: Bar[],
  { cell, withResult, sides }: { cell: (bar: Bar) => string; withResult: boolean; sides: string },
) {
  const clipColumns = [...new Set(clipBars.map((bar) => bar.metric))];
  const grouped = bars.filter((bar) => bar.metric !== metrics.falseOutlines && (bar.condition ?? bar.borderColor) !== null);
  const byConditionAndTilt = grouped.filter((bar) => bar.condition !== null && bar.tiltBucket !== null);
  const empty = bars.filter((bar) => bar.metric === metrics.falseOutlines);
  const result = withResult ? ' Result |' : '';
  const resultRule = withResult ? ' --- |' : '';
  const metricColumns = groupMetrics.join(' | ');
  const reportedTable = (title: string, columns: string, rows: Bar[]) => [
    title,
    '',
    `| ${columns} | ${metricColumns} |`,
    `| --- | --- |${' --: |'.repeat(groupMetrics.length)}`,
    ...groupRows(rows, { withResult: false, cell }),
    '',
  ];
  return [
    `Card frames by condition and tilt in degrees, ${sides}:`,
    '',
    `| Condition | Tilt | ${metricColumns} |${result}`,
    `| --- | --- |${' --: |'.repeat(groupMetrics.length)}${resultRule}`,
    ...groupRows(byConditionAndTilt, { withResult, cell }),
    '',
    'Empty frames:',
    '',
    `| Condition | Tilt | ${metrics.falseOutlines} |${result}`,
    `| --- | --- | --: |${resultRule}`,
    ...groupRows(empty, { withResult, cell }),
    '',
    `Clips by condition, ${sides}:`,
    '',
    `| Condition | ${clipColumns.join(' | ')} |${result}`,
    `| --- |${' --: |'.repeat(clipColumns.length)}${resultRule}`,
    ...groupRows(clipBars, { withResult, cell }),
    '',
    ...reportedTable(
      'Card frames by condition and border color, reported:',
      'Condition | Border color',
      grouped.filter((bar) => bar.condition !== null && bar.borderColor !== null),
    ),
    ...reportedTable('Card frames by border color and tilt, reported:', 'Border color | Tilt', grouped.filter((bar) => bar.condition === null)),
  ];
}

export function replayTable({ bars, clipBars, frames, clips, newInsideAndFalseOutlines, clipsWithoutPhoto, pass }: Comparison): string {
  const wholeRunBars = bars.filter((bar) => bar.condition === null && bar.borderColor === null);
  const byConditionAndTilt = bars.filter((bar) => bar.condition !== null && bar.tiltBucket !== null);
  const gatedBars = (rows: Bar[]) => [...new Set(rows.filter((bar) => bar.pass !== null).map((bar) => `- ${bar.metric}: ${bar.bar}`))];
  return [
    ...tables(bars, clipBars, { cell: sideBySide, withResult: true, sides: 'merge base → branch' }),
    'The whole run:',
    '',
    '| Metric | Merge base | Branch | Bar | Result |',
    '| --- | --: | --: | --- | --- |',
    ...wholeRunBars.map((bar) => `| ${bar.metric} | ${bar.base} | ${bar.branch} | ${bar.bar} | ${bar.pass ? 'pass' : 'fail'} |`),
    '',
    'Bars for each condition and tilt:',
    '',
    ...gatedBars(byConditionAndTilt),
    '',
    'Bars for each clip condition:',
    '',
    ...gatedBars(clipBars),
    '',
    pass ? 'Every bar passes.' : 'A bar failed.',
    ...failingLines([...bars, ...clipBars], frames, clips),
    ...(newInsideAndFalseOutlines.length > 0
      ? ['', 'New inside outlines and false outlines, in frame pixels:', '', ...newInsideAndFalseOutlines.map(listedOutline)]
      : []),
    ...(clipsWithoutPhoto.length > 0 ? ['', `Clips that ask for a photo on the merge base and not on the branch: ${clipsWithoutPhoto.join(', ')}`] : []),
    '',
  ].join('\n');
}

export function branchAloneTable(branch: ReplayScore): { table: string; pass: boolean } {
  const reported = compareReplays(branch, branch, { sameDetector: false });
  const limits = branchAloneBars(branch);
  const pass = limits.every((bar) => bar.pass);
  const table = [
    ...tables(reported.bars, reported.clipBars, { cell: branchOnly, withResult: false, sides: 'branch' }),
    'Fixed limits for a branch with no merge base replay:',
    '',
    '| Metric | Branch | Bar | Result |',
    '| --- | --: | --- | --- |',
    ...limits.map((bar) => {
      const group = [bar.condition, bar.tiltBucket].filter((value) => value !== null).join(' ');
      return `| ${bar.metric}${group ? `, ${group}` : ''} | ${bar.branch} | ${bar.bar} | ${bar.pass ? 'pass' : 'fail'} |`;
    }),
    '',
    pass ? 'Every fixed limit passes.' : 'A fixed limit failed.',
    ...failingLines(limits, branch.frames, branch.clips),
    '',
  ].join('\n');
  return { table, pass };
}
