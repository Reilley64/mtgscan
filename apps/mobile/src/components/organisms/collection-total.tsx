import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { Stack } from 'expo-router';

import { priceCredit, shownChange, shownCoverage, shownTotal, spokenChange } from '@/collection/total-labels';
import { colors } from '@/theme';

export function collectionTotalMenu(total: CollectionTotal) {
  const shown = shownTotal(total);
  return (
    <Stack.Toolbar.Menu
      title={priceCredit(total)}
      tintColor={colors.text}
      accessibilityLabel={`Collection total, ${shown}`}
      accessibilityHint={[spokenChange(total), `${shownCoverage(total)} priced`].join(', ')}>
      <Stack.Toolbar.Label>{shown}</Stack.Toolbar.Label>
      <Stack.Toolbar.MenuAction disabled subtitle="Since yesterday">{shownChange(total) ?? '–'}</Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction disabled subtitle="Priced">{shownCoverage(total)}</Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
