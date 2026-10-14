import { Stack, router } from 'expo-router';

import { colors } from '@/theme';

export const filtersDrawerPath = '/filters';

export function collectionFiltersButton(filterCount: number) {
  return (
    <Stack.Toolbar.Button
      key="filters"
      icon="line.3.horizontal.decrease"
      tintColor={colors.text}
      accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount}` : 'Filters'}
      onPress={() => router.push(filtersDrawerPath)}>
      {filterCount > 0 ? (
        <Stack.Toolbar.Badge style={{ backgroundColor: colors.badge, color: colors.text }}>{String(filterCount)}</Stack.Toolbar.Badge>
      ) : null}
    </Stack.Toolbar.Button>
  );
}
