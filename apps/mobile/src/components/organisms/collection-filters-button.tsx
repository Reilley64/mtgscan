import { Stack, router } from 'expo-router';

import { colors } from '@/theme';

export function collectionFiltersButton(activeFilters: number) {
  return (
    <Stack.Toolbar.Button
      key="filters"
      icon="line.3.horizontal.decrease"
      tintColor={colors.text}
      accessibilityLabel={activeFilters > 0 ? `Filters, ${activeFilters}` : 'Filters'}
      onPress={() => router.push('/filters')}>
      {activeFilters > 0 ? (
        <Stack.Toolbar.Badge style={{ backgroundColor: colors.badge, color: colors.text }}>{String(activeFilters)}</Stack.Toolbar.Badge>
      ) : null}
    </Stack.Toolbar.Button>
  );
}
