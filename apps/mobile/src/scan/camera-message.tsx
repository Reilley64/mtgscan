import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from '@/components/secondary-button';
import { colors, spacing, typography } from '@/theme';

type CameraMessageProps = {
  message: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
};

export function CameraMessage({ message, action, children }: CameraMessageProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {children}
      {action ? <SecondaryButton label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  message: {
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: 'center',
  },
});
