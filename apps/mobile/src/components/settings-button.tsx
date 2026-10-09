import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { colors, rounded, sizes } from '@/theme';

export function SettingsButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      style={styles.button}>
      <SymbolView name="gearshape.fill" size={18} tintColor={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.button,
    height: sizes.button,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
