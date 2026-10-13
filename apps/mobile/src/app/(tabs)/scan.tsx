import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchButton } from '@/components/molecules/batch-button';
import { useGallery } from '@/gallery/gallery-state';
import { CameraMessage } from '@/scan/camera-message';
import { GalleryDownload } from '@/scan/gallery-download';
import { PullToAdd } from '@/scan/pull-to-add';
import { ScanCamera } from '@/scan/scan-camera';
import { useCameraAccess } from '@/scan/use-camera-access';
import { usePullToAdd } from '@/scan/use-pull-to-add';
import { spacing } from '@/theme';

function CameraContent() {
  const access = useCameraAccess();
  switch (access) {
    case 'granted':
      return <ScanCamera />;
    case 'denied':
      return (
        <CameraMessage
          message="Camera access is off."
          action={{ label: 'Open Settings', onPress: () => void Linking.openSettings() }}
        />
      );
    case 'unavailable':
      return <CameraMessage message="Camera not available" />;
    case 'checking':
      return null;
  }
}

function ScanContent() {
  const { installed, delivery, downloadNow, tryAgain } = useGallery();
  if (installed === undefined) {
    return null;
  }
  if (installed === null) {
    return <GalleryDownload delivery={delivery} downloadNow={downloadNow} tryAgain={tryAgain} />;
  }
  return <CameraContent />;
}

type ScanBatchButtonProps = {
  count: number;
  actions: ReturnType<typeof usePullToAdd>['batchButtonActions'];
};

function ScanBatchButton({ count, actions }: ScanBatchButtonProps) {
  const { top } = useSafeAreaInsets();
  return (
    <View className="absolute right-lg" style={{ top: top + spacing.sm }}>
      <BatchButton count={count} onPress={() => router.push('/scan-batch')} {...actions} />
    </View>
  );
}

export default function ScanScreen() {
  const { pull, count, distance, panHandlers, batchButtonActions } = usePullToAdd();
  return (
    <View accessibilityLabel="Camera" className="flex-1 bg-camera-off" {...panHandlers}>
      <ScanContent />
      <PullToAdd pull={pull} count={count} distance={distance} />
      <ScanBatchButton count={count} actions={batchButtonActions} />
    </View>
  );
}
