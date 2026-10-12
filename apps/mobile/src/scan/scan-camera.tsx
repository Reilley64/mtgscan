import { router, useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, sizes, spacing } from '@/theme';

import { CardDetectorView } from '../../modules/card-detector';
import { CameraMessage } from './camera-message';
import { LatestScanChip } from './latest-scan-chip';
import { useScanBatch } from './scan-batch-state';
import { useAutomaticCapture } from './use-automatic-capture';
import { useScanRecognition } from './use-scan-recognition';

function LatestScan() {
  const { latest, dispatch } = useScanBatch();
  if (!latest) {
    return null;
  }
  return (
    <View style={styles.latestScan}>
      <LatestScanChip
        latest={latest}
        onOpen={(scanId) => router.push({ pathname: '/scan-details', params: { scanId } })}
        onAddCopy={(scanId) => dispatch({ type: 'addCopy', scanId })}
      />
    </View>
  );
}

export function ScanCamera() {
  const focused = useIsFocused();
  const { camera, onDetectionSample, stopped, tryAgain } = useAutomaticCapture(useScanRecognition());

  return (
    <>
      <CardDetectorView
        ref={camera}
        active={focused && !stopped}
        outlineColor={colors.cardOutline}
        outlineWidth={sizes.cardOutline}
        onDetectionSample={onDetectionSample}
        style={styles.camera}
      />
      {stopped ? <CameraMessage message="Camera stopped." action={{ label: 'Try again', onPress: tryAgain }} /> : null}
      <LatestScan />
    </>
  );
}

const styles = StyleSheet.create({
  camera: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.cameraOff,
  },
  latestScan: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});
