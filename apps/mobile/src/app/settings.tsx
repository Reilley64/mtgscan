import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export default function SettingsSheet() {
  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Settings
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={spacing.sm}
          style={styles.done}>
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.sheetTitle,
    color: colors.text,
  },
  done: {
    position: 'absolute',
    right: spacing.lg,
  },
  doneLabel: {
    ...typography.bodyStrong,
    fontSize: typography.sheetTitle.fontSize,
    color: colors.primary,
  },
});
