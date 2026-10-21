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

export type PhotoTimes = {
  receivedAt: number;
  capturedAt: number;
  processedAt: number;
  savedAt: number;
};

export type CapturedPhoto = {
  uri: string;
  outline: CardOutline;
  width: number;
  height: number;
  times: PhotoTimes;
};

export type CameraPermission = 'granted' | 'denied' | 'undetermined';
