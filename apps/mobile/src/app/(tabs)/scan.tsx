import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchButton } from '@/components/molecules/batch-button';
import { useGallery } from '@/gallery/gallery-state';
import { CameraMessage } from '@/scan/camera-message';
import { GalleryDownload } from '@/scan/gallery-download';
import { useScanBatch } from '@/scan/scan-batch-state';
import { ScanCamera } from '@/scan/scan-camera';
import { useCameraAccess } from '@/scan/use-camera-access';
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

function ScanBatchButton() {
  const { batch } = useScanBatch();
  const { top } = useSafeAreaInsets();
  return (
    <View className="absolute right-lg" style={{ top: top + spacing.sm }}>
      <BatchButton count={batch.scans.length} onPress={() => router.push('/scan-batch')} />
    </View>
  );
}

export default function ScanScreen() {
  return (
    <View accessibilityLabel="Camera" className="flex-1 bg-camera-off">
      <ScanContent />
      <ScanBatchButton />
    </View>
  );
}
