import { forwardRef, useImperativeHandle, type ForwardedRef } from 'react';
import { act } from 'expo-router/testing-library';
import { View } from 'react-native';

import type {
  CameraPermission,
  CapturedPhoto,
  CardDetectorCamera,
  CardDetectorViewProps,
  DetectionSample,
  FrameQuad,
} from '../modules/card-detector';
import type { ScanPhases } from '../src/scan/recognition-log';

type PhotoPhases = Pick<ScanPhases, 'photoRequest' | 'photoCapture' | 'photoProcessing' | 'photoSave' | 'photoHandOff'>;

const instantPhoto: PhotoPhases = { photoRequest: 0, photoCapture: 0, photoProcessing: 0, photoSave: 0, photoHandOff: 0 };

let cameraAvailable = true;
let permission: CameraPermission = 'granted';
let answerToPrompt: CameraPermission = 'granted';
let prompts = 0;
let failingPhotos = 0;
let heldPhoto: { reject: () => void } | null = null;
let holdingNextPhoto = false;
let photos: CapturedPhoto[] = [];
let deletedPhotos: string[] = [];
let mountedView: CardDetectorViewProps | null = null;
let photoPhases = instantPhoto;

function photoTimes() {
  const receivedAt = Date.now() + photoPhases.photoRequest;
  const capturedAt = receivedAt + photoPhases.photoCapture;
  const processedAt = capturedAt + photoPhases.photoProcessing;
  const savedAt = processedAt + photoPhases.photoSave;
  if (photoPhases !== instantPhoto) {
    jest.setSystemTime(savedAt + photoPhases.photoHandOff);
  }
  return { receivedAt, capturedAt, processedAt, savedAt };
}

async function takePhoto(outline: FrameQuad): Promise<CapturedPhoto> {
  if (holdingNextPhoto) {
    holdingNextPhoto = false;
    return new Promise((_, reject) => {
      heldPhoto = { reject: () => reject(new Error('The photo failed')) };
    });
  }
  if (failingPhotos > 0) {
    failingPhotos -= 1;
    throw new Error('The photo failed');
  }
  const photo: CapturedPhoto = {
    uri: `file:///tmp/scan-${photos.length + 1}.jpg`,
    outline,
    width: 4032,
    height: 2268,
    times: photoTimes(),
  };
  photos = [...photos, photo];
  return photo;
}

function FakeCardDetectorView(
  { onDetectionSample, active, outlineColor, outlineWidth, ...viewProps }: Omit<CardDetectorViewProps, 'ref'>,
  ref: ForwardedRef<CardDetectorCamera>,
) {
  mountedView = { onDetectionSample, active, outlineColor, outlineWidth, ...viewProps };
  useImperativeHandle(ref, () => ({ takePhoto }));
  return <View {...viewProps} />;
}

export const fakeCardDetector = {
  CardDetectorView: forwardRef(FakeCardDetectorView),
  isCameraAvailable: () => cameraAvailable,
  getCameraPermission: async () => permission,
  requestCameraPermission: async () => {
    prompts += 1;
    permission = answerToPrompt;
    return permission;
  },
  deletePhoto: async (uri: string) => {
    deletedPhotos = [...deletedPhotos, uri];
  },
};

function cameraView() {
  if (!mountedView) {
    throw new Error('The camera is not on the screen');
  }
  return mountedView;
}

export async function showSamples(samples: DetectionSample[]) {
  for (const sample of samples) {
    await act(async () => {
      cameraView().onDetectionSample({ nativeEvent: sample } as Parameters<
        CardDetectorViewProps['onDetectionSample']
      >[0]);
    });
  }
}

export function cameraIsOn() {
  return mountedView?.active === true;
}

export function photosTaken() {
  return photos.length;
}

export function photoOutlines() {
  return photos.map((photo) => photo.outline);
}

export function holdNextPhoto() {
  holdingNextPhoto = true;
  return {
    fail: () => heldPhoto?.reject(),
  };
}

export function photosDeleted() {
  return deletedPhotos;
}

export function photosTake(phases: PhotoPhases) {
  photoPhases = phases;
}

export function failNextPhotos(count: number) {
  failingPhotos = count;
}

export function cameraAccessIs(state: CameraPermission) {
  permission = state;
}

export function userAnswersCameraPrompt(answer: CameraPermission) {
  answerToPrompt = answer;
}

export function cameraPrompts() {
  return prompts;
}

export function phoneHasNoCamera() {
  cameraAvailable = false;
}

export function resetFakeCardDetector() {
  cameraAvailable = true;
  permission = 'granted';
  answerToPrompt = 'granted';
  prompts = 0;
  failingPhotos = 0;
  photos = [];
  heldPhoto = null;
  holdingNextPhoto = false;
  deletedPhotos = [];
  mountedView = null;
  photoPhases = instantPhoto;
}
