import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, rounded, sizes, typography } from '@/theme';

type DangerButtonProps = {
  label: string;
  onPress: () => void;
};

export function DangerButton({ label, onPress }: DangerButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: sizes.button,
    borderRadius: rounded.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerTint,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
});
