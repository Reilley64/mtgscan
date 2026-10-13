import { router, useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LatestScanControls } from '@/components/organisms/latest-scan-controls';
import { colors, sizes, spacing } from '@/theme';

import { CardDetectorView } from '../../modules/card-detector';
import { CameraMessage } from './camera-message';
import { useScanBatch } from './scan-batch-state';
import { useAutomaticCapture } from './use-automatic-capture';
import { useScanRecognition } from './use-scan-recognition';

function LatestScan() {
  const { latest, dispatch, addCopy } = useScanBatch();
  const { bottom } = useSafeAreaInsets();
  return (
    <View className="absolute inset-x-lg" style={{ bottom: bottom + spacing.lg }}>
      <LatestScanControls
        latest={latest}
        onOpen={(scanId) => router.push({ pathname: '/scan-details', params: { scanId } })}
        onAddCopy={addCopy}
        onChangeFinish={(scanId, finish) => dispatch({ type: 'setFinish', scanId, finish })}
        onChangeSet={(scanId) => router.push({ pathname: '/scan-printings', params: { scanId } })}
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
        style={StyleSheet.absoluteFill}
      />
      {stopped ? <CameraMessage message="Camera stopped." action={{ label: 'Try again', onPress: tryAgain }} /> : null}
      <LatestScan />
    </>
  );
}
