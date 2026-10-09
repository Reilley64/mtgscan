import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, rounded, sizes, typography } from '@/theme';

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function SecondaryButton({ label, onPress }: SecondaryButtonProps) {
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
    backgroundColor: colors.surfaceControl,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
});
