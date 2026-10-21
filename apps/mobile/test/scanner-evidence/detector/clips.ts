import type { DetectionSample } from '../../../modules/card-detector';
import { initialCapture, observeSample } from '../../../src/scan/capture';
import { cardCorners, median, outlineOnCard, type Point } from './geometry';
import type { Bar } from './score';

export type ClipFrameLabel = {
  frame: string;
  timeMs: number;
  corners: Point[];
  intrinsicMatrix: number[][];
};

export type ClipLabel = {
  clip: string;
  condition: string;
  scryfallId: string;
  borderColor: string;
  tiltDegrees: number;
  tiltBucket: string;
  restMs: number;
  frames: ClipFrameLabel[];
  photo: ClipFrameLabel & { width: number; height: number };
};

export type ClipScore = {
  clip: string;
  condition: string;
  photoAskedFor: boolean;
  settleTimeMs: number | null;
  photoOutlineMm: number | null;
  handShiftMm: number | null;
  jitterMm: number | null;
};

export type ClipFrameSize = { frameWidth: number; frameHeight: number; cardMm: Point };

function heldStillSample(clip: ClipLabel, samples: DetectionSample[]) {
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
    const outline = corners.map(({ x, y }): Point => [x * size.frameWidth, y * size.frameHeight]);
    const onCard = outlineOnCard(outline, frame.corners, size.cardMm).corners;
    return [onCard.map(([x, y], corner): Point => [x - card[corner][0], y - card[corner][1]])];
  });
  if (errors.length < 2) return null;
  return Math.max(...card.map((_, corner) => spread(errors.map((error) => error[corner]))));
}

export function scoreClip(clip: ClipLabel, samples: DetectionSample[], size: ClipFrameSize): ClipScore {
  const heldStill = heldStillSample(clip, samples);
  const { photo } = clip;
  const onPhoto = (fractions: Point[]) => fractions.map(([x, y]): Point => [x * photo.width, y * photo.height]);
  const photoError = (fractions: Point[]) => outlineOnCard(onPhoto(fractions), photo.corners, size.cardMm).errorMm;
  const heldOutline = heldStill?.sample.corners?.map(({ x, y }): Point => [x, y]);
  const heldTruth = heldStill && clip.frames[heldStill.index].corners.map(([x, y]): Point => [x / size.frameWidth, y / size.frameHeight]);
  return {
    clip: clip.clip,
    condition: clip.condition,
    photoAskedFor: heldStill !== null,
    settleTimeMs: heldStill ? clip.frames[heldStill.index].timeMs - clip.frames[0].timeMs : null,
    photoOutlineMm: heldOutline ? photoError(heldOutline) : null,
    handShiftMm: heldTruth ? photoError(heldTruth) : null,
    jitterMm: jitter(clip, samples, size),
  };
}

export type ClipGroupScore = {
  condition: string;
  clips: number;
  photosAskedFor: string[];
  settleTimeMs: number | null;
  jitterMm: number | null;
  photoOutlineMm: number | null;
  handShiftMm: number | null;
};

const photoOutlineMedianLimitMm = 0.1;

function medianOf(values: (number | null)[]) {
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
      handShiftMm: medianOf(group.map((clip) => clip.handShiftMm)),
    };
  });
}

const toHundredths = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);
const millimetres = (value: number | null) => (value === null ? 'none' : `${value.toFixed(2)} mm`);
const milliseconds = (value: number | null) => (value === null ? 'none' : `${value.toFixed(0)} ms`);

function notWorse(base: number | null, branch: number | null, limit = 0) {
  return base === null || branch === null || branch - base <= limit;
}

function groupBars(base: ClipGroupScore, branch: ClipGroupScore): Bar[] {
  const key = { condition: branch.condition, borderColor: null, tiltBucket: null };
  return [
    {
      ...key,
      metric: 'Photo asked for',
      base: `${base.photosAskedFor.length} of ${base.clips}`,
      branch: `${branch.photosAskedFor.length} of ${branch.clips}`,
      bar: 'not fewer',
      pass: branch.photosAskedFor.length >= base.photosAskedFor.length,
    },
    {
      ...key,
      metric: 'Settle time median',
      base: milliseconds(base.settleTimeMs),
      branch: milliseconds(branch.settleTimeMs),
      bar: 'not worse',
      pass: notWorse(base.settleTimeMs, branch.settleTimeMs ?? Infinity),
    },
    {
      ...key,
      metric: 'Jitter median',
      base: millimetres(base.jitterMm),
      branch: millimetres(branch.jitterMm),
      bar: 'not worse, to 0.01 mm',
      pass: notWorse(toHundredths(base.jitterMm), toHundredths(branch.jitterMm)),
    },
    {
      ...key,
      metric: 'Photo outline median',
      base: millimetres(base.photoOutlineMm),
      branch: millimetres(branch.photoOutlineMm),
      bar: `not worse by more than ${photoOutlineMedianLimitMm} mm`,
      pass: notWorse(base.photoOutlineMm, branch.photoOutlineMm, photoOutlineMedianLimitMm),
    },
    {
      ...key,
      metric: 'Hand shift median',
      base: millimetres(base.handShiftMm),
      branch: millimetres(branch.handShiftMm),
      bar: 'reported',
      pass: null,
    },
  ];
}

export function compareClips(base: ClipGroupScore[], branch: ClipGroupScore[]) {
  return branch.flatMap((group) => {
    const before = base.find((candidate) => candidate.condition === group.condition);
    if (!before) throw new Error(`the merge base has no clips for ${group.condition}`);
    return groupBars(before, group);
  });
}
