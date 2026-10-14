import { Stack, router } from 'expo-router';

import { colors } from '@/theme';

export const filtersDrawerPath = '/filters';

export function collectionFiltersButton(chipCount: number) {
  return (
    <Stack.Toolbar.Button
      key="filters"
      icon="line.3.horizontal.decrease"
      tintColor={colors.text}
      accessibilityLabel={chipCount > 0 ? `Filters, ${chipCount}` : 'Filters'}
      onPress={() => router.push(filtersDrawerPath)}>
      {chipCount > 0 ? (
        <Stack.Toolbar.Badge style={{ backgroundColor: colors.badge, color: colors.text }}>{String(chipCount)}</Stack.Toolbar.Badge>
      ) : null}
    </Stack.Toolbar.Button>
  );
}
