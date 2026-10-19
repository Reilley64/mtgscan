import { StyleSheet, View } from 'react-native';

export function Grayscale() {
  return <View pointerEvents="none" className="absolute inset-0 bg-background" style={styles.overlay} />;
}

const styles = StyleSheet.create({
  overlay: { mixBlendMode: 'saturation' },
});
