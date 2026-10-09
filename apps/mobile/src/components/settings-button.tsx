import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { colors, rounded } from '@/theme';

const buttonSize = 36;

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
    width: buttonSize,
    height: buttonSize,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
