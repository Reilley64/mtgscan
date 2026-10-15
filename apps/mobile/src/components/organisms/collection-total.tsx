import { Stack } from 'expo-router';

import { priceCredit, shownCoverage, shownTotal, spokenTotal, type ConvertedCollectionTotal } from '@/collection/total-labels';
import { shownDayAndMonth } from '@/lib/shown-day';
import { colors } from '@/theme';

function hintOf(total: ConvertedCollectionTotal) {
  const coverage = `${shownCoverage(total)} priced`;
  return total.stale ? `${coverage}. The prices may be out of date.` : coverage;
}

export function collectionTotalMenu(total: ConvertedCollectionTotal) {
  const shown = shownTotal(total);
  return (
    <Stack.Toolbar.Menu
      title={priceCredit(total)}
      tintColor={colors.text}
      accessibilityLabel={`Collection total, ${spokenTotal(total)}`}
      accessibilityHint={hintOf(total)}>
      <Stack.Toolbar.Label>{shown}</Stack.Toolbar.Label>
      <Stack.Toolbar.MenuAction disabled subtitle="Priced">{shownCoverage(total)}</Stack.Toolbar.MenuAction>
      {total.stale && total.prices_observed_at && (
        <Stack.Toolbar.MenuAction disabled icon="clock" subtitle="Prices from">
          {shownDayAndMonth(total.prices_observed_at)}
        </Stack.Toolbar.MenuAction>
      )}
    </Stack.Toolbar.Menu>
  );
}
