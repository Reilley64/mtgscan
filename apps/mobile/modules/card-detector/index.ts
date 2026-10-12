import { requireNativeModule, requireNativeView } from 'expo';
import type { ComponentType, Ref } from 'react';
import type { ColorValue, NativeSyntheticEvent, ViewProps } from 'react-native';

import type { CameraPermission, CapturedPhoto, DetectionSample, ShutterFeedback } from './src/detection';

export type * from './src/detection';

type CardDetectorModule = {
  isCameraAvailable(): boolean;
  getCameraPermission(): Promise<CameraPermission>;
  requestCameraPermission(): Promise<CameraPermission>;
  deletePhoto(uri: string): Promise<void>;
};

export type CardDetectorCamera = {
  takePhoto(): Promise<CapturedPhoto>;
};

export type CardDetectorViewProps = ViewProps & {
  ref?: Ref<CardDetectorCamera>;
  active: boolean;
  outlineColor: ColorValue;
  outlineWidth: number;
  shutterFeedback: ShutterFeedback;
  onDetectionSample: (event: NativeSyntheticEvent<DetectionSample>) => void;
};

const cardDetector = requireNativeModule<CardDetectorModule>('CardDetector');

export const CardDetectorView: ComponentType<CardDetectorViewProps> = requireNativeView('CardDetector');

export function isCameraAvailable() {
  return cardDetector.isCameraAvailable();
}

export function getCameraPermission() {
  return cardDetector.getCameraPermission();
}

export function requestCameraPermission() {
  return cardDetector.requestCameraPermission();
}

export function deletePhoto(uri: string) {
  return cardDetector.deletePhoto(uri);
}
