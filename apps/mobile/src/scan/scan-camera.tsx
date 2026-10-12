import { useIsFocused } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { colors, sizes } from '@/theme';

import {
  CardDetectorView,
  deletePhoto,
  type CapturedPhoto,
  type ShutterFeedback,
} from '../../modules/card-detector';
import { CameraMessage } from './camera-message';
import { useAutomaticCapture } from './use-automatic-capture';

const shutterFeedback: ShutterFeedback = { style: 'medium', intensity: 1 };

export function ScanCamera() {
  const focused = useIsFocused();
  const onPhoto = useCallback((photo: CapturedPhoto) => {
    void deletePhoto(photo.uri);
  }, []);
  const { camera, onDetectionSample, stopped, tryAgain } = useAutomaticCapture(onPhoto);

  return (
    <>
      <CardDetectorView
        ref={camera}
        active={focused && !stopped}
        outlineColor={colors.cardOutline}
        outlineWidth={sizes.cardOutline}
        shutterFeedback={shutterFeedback}
        onDetectionSample={onDetectionSample}
        style={styles.camera}
      />
      {stopped ? <CameraMessage message="Camera stopped." action={{ label: 'Try again', onPress: tryAgain }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  camera: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.cameraOff,
  },
});
