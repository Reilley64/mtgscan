import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

export default function ScanScreen() {
  return <View accessibilityLabel="Camera" style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cameraOff,
  },
});
