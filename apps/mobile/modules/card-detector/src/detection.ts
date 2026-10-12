import type { CardOutline, NormalizedPhotoPoint } from '../../card-recognizer';

export type FrameQuad = [
  topLeft: NormalizedPhotoPoint,
  topRight: NormalizedPhotoPoint,
  bottomRight: NormalizedPhotoPoint,
  bottomLeft: NormalizedPhotoPoint,
];

export type DetectorErrorCode = 'camera_failed' | 'unreadable_frame' | 'unsupported_frame' | 'vision_failed';

export type DetectionSample = {
  detected: boolean;
  corners: FrameQuad | null;
  proposalDetected: boolean;
  proposalCorners: FrameQuad | null;
  confidence: number;
  areaRatio: number;
  aspectRatio: number;
  edgeSupportMin: number;
  signature: number[];
  frameWidth: number;
  frameHeight: number;
  nativeDurationMs: number;
  sampledAtMs: number;
  runtimeErrorCode: DetectorErrorCode | null;
};

export type CapturedPhoto = {
  uri: string;
  outline: CardOutline;
};

export type ShutterFeedback = {
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
  intensity: number;
};

export type CameraPermission = 'granted' | 'denied' | 'undetermined';
