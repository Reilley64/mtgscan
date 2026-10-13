import { Stack } from 'expo-router';

import { colors, typography } from '@/theme';

export function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerLargeTitleStyle: {
          fontSize: typography.largeTitle.fontSize,
          fontWeight: typography.largeTitle.fontWeight,
          color: colors.text,
        },
        headerTitleStyle: { ...typography.sheetTitle, color: colors.text },
      }}
    />
  );
}
