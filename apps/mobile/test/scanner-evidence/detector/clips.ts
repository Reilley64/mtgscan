import type { DetectionSample, FrameQuad } from '../../../modules/card-detector';
import { initialCapture, observeSample } from '../../../src/scan/capture';
import { cardCorners, inPixels, isInside, median, millimetres, outlineOnCard, sidesInsideMm, type Point } from './geometry';
import type { Bar, BorderColor, Condition, TiltBucket } from './score';

export type ClipFrameLabel = {
  frame: string;
  timeMs: number;
  corners: Point[];
  intrinsicMatrix: number[][];
};

export type ClipLabel = {
  clip: string;
  condition: Condition;
  scryfallId: string;
  borderColor: BorderColor;
  tiltDegrees: number;
  tiltBucket: TiltBucket;
  restMs: number;
  frames: ClipFrameLabel[];
  photo: ClipFrameLabel & { width: number; height: number };
};

export type ClipScore = {
  clip: string;
  condition: Condition;
  photoAskedFor: boolean;
  settleTimeMs: number | null;
  photoOutline: Point[] | null;
  photoOutlineMm: number | null;
  photoOutlineInside: boolean;
  handShiftMm: number | null;
  jitterMm: number | null;
};

export type ClipFrameSize = { frameWidth: number; frameHeight: number; cardMm: Point };

export const photoOutlineMedianBelowMm = 0.5;

export const clipMetrics = {
  photoAskedFor: 'Photo asked for',
  settleTime: 'Settle time median',
  jitter: 'Jitter median',
  photoOutline: 'Photo outline median',
  insidePhotoOutlines: 'Inside photo outlines',
  handShift: 'Hand shift median',
  photoOutlineAllClips: 'Photo outline median, all clips',
} as const;

export function heldStillSample(clip: ClipLabel, samples: DetectionSample[]) {
  let state = initialCapture();
  for (const [index, sample] of samples.entries()) {
    const step = observeSample(state, { ...sample, sampledAtMs: clip.frames[index].timeMs });
    if (step.requestPhoto) return { index, sample };
    state = step.state;
  }
  return null;
}

function spread(points: Point[]) {
  const mean = points.reduce(([x, y], point): Point => [x + point[0] / points.length, y + point[1] / points.length], [0, 0]);
  return Math.sqrt(points.reduce((total, [x, y]) => total + (x - mean[0]) ** 2 + (y - mean[1]) ** 2, 0) / points.length);
}

function jitter(clip: ClipLabel, samples: DetectionSample[], size: ClipFrameSize) {
  const card = cardCorners(size.cardMm);
  const errors = clip.frames.flatMap((frame, index) => {
    const corners = samples[index].detected ? samples[index].corners : null;
    if (frame.timeMs < clip.restMs || !corners) return [];
    const onCard = outlineOnCard(inPixels(corners, size.frameWidth, size.frameHeight), frame.corners, size.cardMm).corners;
    return [onCard.map(([x, y], corner): Point => [x - card[corner][0], y - card[corner][1]])];
  });
  if (errors.length < 2) return null;
  return Math.max(...card.map((_, corner) => spread(errors.map((error) => error[corner]))));
}

export function scoreClip(clip: ClipLabel, samples: DetectionSample[], size: ClipFrameSize, photoOutline?: FrameQuad): ClipScore {
  const heldStill = heldStillSample(clip, samples);
  const { photo } = clip;
  const onPhotoCard = (outline: Point[]) => outlineOnCard(outline, photo.corners, size.cardMm);
  const quad = photoOutline ?? heldStill?.sample.corners;
  const outline = quad ? inPixels(quad, photo.width, photo.height) : null;
  const heldTruth =
    heldStill &&
    clip.frames[heldStill.index].corners.map(([x, y]): Point => [(x / size.frameWidth) * photo.width, (y / size.frameHeight) * photo.height]);
  return {
    clip: clip.clip,
    condition: clip.condition,
    photoAskedFor: heldStill !== null,
    settleTimeMs: heldStill ? clip.frames[heldStill.index].timeMs - clip.frames[0].timeMs : null,
    photoOutline: outline,
    photoOutlineMm: outline ? onPhotoCard(outline).errorMm : null,
    photoOutlineInside: outline ? isInside(sidesInsideMm(onPhotoCard(outline).corners, size.cardMm)) : false,
    handShiftMm: heldTruth ? onPhotoCard(heldTruth).errorMm : null,
    jitterMm: jitter(clip, samples, size),
  };
}

export type ClipGroupScore = {
  condition: Condition;
  clips: number;
  photosAskedFor: string[];
  settleTimeMs: number | null;
  jitterMm: number | null;
  photoOutlineMm: number | null;
  insidePhotoOutlines: string[];
  handShiftMm: number | null;
};

export function medianOf(values: (number | null)[]) {
  const known = values.filter((value) => value !== null);
  return known.length > 0 ? median(known) : null;
}

export function scoreClipGroups(clips: ClipScore[]): ClipGroupScore[] {
  const conditions = [...new Set(clips.map((clip) => clip.condition))];
  return conditions.map((condition) => {
    const group = clips.filter((clip) => clip.condition === condition);
    return {
      condition,
      clips: group.length,
      photosAskedFor: group.filter((clip) => clip.photoAskedFor).map((clip) => clip.clip),
      settleTimeMs: medianOf(group.map((clip) => clip.settleTimeMs)),
      jitterMm: medianOf(group.map((clip) => clip.jitterMm)),
      photoOutlineMm: medianOf(group.map((clip) => clip.photoOutlineMm)),
      insidePhotoOutlines: group.filter((clip) => clip.photoOutlineInside).map((clip) => clip.clip),
      handShiftMm: medianOf(group.map((clip) => clip.handShiftMm)),
    };
  });
}

const toHundredths = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);
const milliseconds = (value: number | null) => (value === null ? 'none' : `${value.toFixed(0)} ms`);

function notWorse(base: number | null, branch: number | null) {
  return base === null || branch === null || branch <= base;
}

export type ClipSide = { clips: ClipScore[]; clipGroups: ClipGroupScore[] };

function groupBars(base: ClipGroupScore, branch: ClipGroupScore, baseClips: Map<string, ClipScore>, branchClips: ClipScore[]): Bar[] {
  const key = { condition: branch.condition, borderColor: null, tiltBucket: null };
  const worseClips = (value: (clip: ClipScore) => number | null) =>
    branchClips
      .filter((clip) => {
        const before = baseClips.get(clip.clip);
        return before !== undefined && value(before) !== null && !notWorse(value(before), value(clip) ?? Infinity);
      })
      .map((clip) => clip.clip);
  return [
    {
      ...key,
      metric: clipMetrics.photoAskedFor,
      base: `${base.photosAskedFor.length} of ${base.clips}`,
      branch: `${branch.photosAskedFor.length} of ${branch.clips}`,
      bar: 'not fewer',
      pass: branch.photosAskedFor.length >= base.photosAskedFor.length,
      listed: base.photosAskedFor.filter((clip) => !branch.photosAskedFor.includes(clip)),
    },
    {
      ...key,
      metric: clipMetrics.settleTime,
      base: milliseconds(base.settleTimeMs),
      branch: milliseconds(branch.settleTimeMs),
      bar: 'not worse',
      pass: notWorse(base.settleTimeMs, branch.settleTimeMs ?? Infinity),
      listed: worseClips((clip) => clip.settleTimeMs),
    },
    {
      ...key,
      metric: clipMetrics.jitter,
      base: millimetres(base.jitterMm),
      branch: millimetres(branch.jitterMm),
      bar: 'not worse, to 0.01 mm',
      pass: notWorse(toHundredths(base.jitterMm), toHundredths(branch.jitterMm)),
      listed: worseClips((clip) => toHundredths(clip.jitterMm)),
    },
    {
      ...key,
      metric: clipMetrics.photoOutline,
      base: millimetres(base.photoOutlineMm),
      branch: millimetres(branch.photoOutlineMm),
      bar: 'reported',
      pass: null,
      listed: [],
    },
    {
      ...key,
      metric: clipMetrics.insidePhotoOutlines,
      base: String(base.insidePhotoOutlines.length),
      branch: String(branch.insidePhotoOutlines.length),
      bar: 'no new one',
      pass: branch.insidePhotoOutlines.every((clip) => base.insidePhotoOutlines.includes(clip)),
      listed: branch.insidePhotoOutlines.filter((clip) => !base.insidePhotoOutlines.includes(clip)),
    },
    {
      ...key,
      metric: clipMetrics.handShift,
      base: millimetres(base.handShiftMm),
      branch: millimetres(branch.handShiftMm),
      bar: 'reported',
      pass: null,
      listed: [],
    },
  ];
}

export function compareClips(base: ClipSide, branch: ClipSide) {
  return branch.clipGroups.flatMap((group) => {
    const before = base.clipGroups.find((candidate) => candidate.condition === group.condition);
    if (!before) throw new Error(`the merge base has no clips for ${group.condition}`);
    return groupBars(
      before,
      group,
      new Map(base.clips.map((clip) => [clip.clip, clip])),
      branch.clips.filter((clip) => clip.condition === group.condition),
    );
  });
}

export function photoOutlineBar(base: ClipScore[], branch: ClipScore[]): Bar {
  const median = medianOf(branch.map((clip) => clip.photoOutlineMm));
  return {
    condition: null,
    borderColor: null,
    tiltBucket: null,
    metric: clipMetrics.photoOutlineAllClips,
    base: millimetres(medianOf(base.map((clip) => clip.photoOutlineMm))),
    branch: millimetres(median),
    bar: `below ${photoOutlineMedianBelowMm} mm`,
    pass: median === null || median < photoOutlineMedianBelowMm,
    listed: branch.filter((clip) => clip.photoOutlineMm !== null && clip.photoOutlineMm >= photoOutlineMedianBelowMm).map((clip) => clip.clip),
  };
}
