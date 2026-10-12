import { Linking, StyleSheet, View } from 'react-native';

import { CameraMessage } from '@/scan/camera-message';
import { ScanCamera } from '@/scan/scan-camera';
import { useCameraAccess } from '@/scan/use-camera-access';
import { colors } from '@/theme';

function ScanContent() {
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

export default function ScanScreen() {
  return (
    <View accessibilityLabel="Camera" style={styles.screen}>
      <ScanContent />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cameraOff,
  },
});
