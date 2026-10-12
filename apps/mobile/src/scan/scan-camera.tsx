import { router, useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LatestScanChip } from '@/components/organisms/latest-scan-chip';
import { ScanQuickActions } from '@/components/organisms/scan-quick-actions';
import { colors, sizes } from '@/theme';

import { CardDetectorView } from '../../modules/card-detector';
import { CameraMessage } from './camera-message';
import { recognizedScan } from './scan-batch';
import { useScanBatch } from './scan-batch-state';
import { useAutomaticCapture } from './use-automatic-capture';
import { useScanRecognition } from './use-scan-recognition';

function LatestScan() {
  const { latest, dispatch } = useScanBatch();
  const scan = recognizedScan(latest?.kind === 'scan' ? latest.scan : null);
  return (
    <View className="absolute inset-x-lg bottom-safe-offset-lg gap-sm">
      {latest ? (
        <LatestScanChip
          latest={latest}
          onOpen={(scanId) => router.push({ pathname: '/scan-details', params: { scanId } })}
        />
      ) : null}
      <ScanQuickActions
        scan={scan}
        onAddCopy={(scanId) => dispatch({ type: 'addCopy', scanId })}
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
