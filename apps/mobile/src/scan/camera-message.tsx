import type { ReactNode } from 'react';
import { StyleSheet, Text as NativeText, View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { colors, spacing, typography } from '@/theme';

type CameraMessageProps = {
  message: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
};

export function CameraMessage({ message, action, children }: CameraMessageProps) {
  return (
    <View style={styles.container}>
      <NativeText style={styles.message}>{message}</NativeText>
      {children}
      {action ? (
        <Button onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
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
