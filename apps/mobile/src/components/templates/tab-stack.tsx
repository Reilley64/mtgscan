import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { softTopScrollEdgeEffects } from '@/lib/scroll-edge-effects';
import { colors, typography } from '@/theme';

export const inlineTitleStyle = { ...typography.sheetTitle, color: colors.text };

export function TabStack({ children }: { children?: ReactNode }) {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerLargeTitleStyle: {
          fontSize: typography.largeTitle.fontSize,
          fontWeight: typography.largeTitle.fontWeight,
          color: colors.text,
        },
        headerTitleStyle: inlineTitleStyle,
        scrollEdgeEffects: softTopScrollEdgeEffects,
      }}>
      {children}
    </Stack>
  );
}
