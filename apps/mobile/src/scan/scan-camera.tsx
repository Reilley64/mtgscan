import { router, useIsFocused } from 'expo-router';
import type { Dispatch } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassGroup } from '@/components/atoms/liquid-glass-prototype';
import { LatestScanChip } from '@/components/organisms/latest-scan-chip';
import { ScanQuickActions } from '@/components/organisms/scan-quick-actions';
import { colors, sizes, spacing } from '@/theme';

import { CardDetectorView } from '../../modules/card-detector';
import { CameraMessage } from './camera-message';
import { recognizedScan, type ScanBatchAction } from './scan-batch';
import { useScanBatch, type LatestScan } from './scan-batch-state';
import { useAutomaticCapture } from './use-automatic-capture';
import { useScanRecognition } from './use-scan-recognition';

export function LatestScanOverlay({ latest, dispatch }: { latest: LatestScan | null; dispatch: Dispatch<ScanBatchAction> }) {
  const { bottom } = useSafeAreaInsets();
  const scan = recognizedScan(latest?.kind === 'scan' ? latest.scan : null);
  return (
    <GlassGroup className="absolute inset-x-lg gap-sm" style={{ bottom: bottom + spacing.lg }}>
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
    </GlassGroup>
  );
}

function BatchLatestScan() {
  const { latest, dispatch } = useScanBatch();
  return <LatestScanOverlay latest={latest} dispatch={dispatch} />;
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
      <BatchLatestScan />
    </>
  );
}
