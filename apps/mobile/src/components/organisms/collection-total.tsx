import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Popover } from '@/components/atoms/popover';
import { Text } from '@/components/atoms/text';
import { priceCredit, shownChange, shownCoverage, shownTotal, spokenChange } from '@/collection/total-labels';
import { colors, sizes } from '@/theme';

function TotalRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View className="flex-row justify-between gap-md">
      <Text className="text-text-muted">{label}</Text>
      {value === undefined ? (
        <Text variant="body-strong" className="text-text-dim">
          –
        </Text>
      ) : (
        <Text variant="body-strong">{value}</Text>
      )}
    </View>
  );
}

export function CollectionTotalButton({ total }: { total: CollectionTotal }) {
  const [open, setOpen] = useState(false);
  const shown = shownTotal(total);
  const details = [spokenChange(total), `${shownCoverage(total)} priced`];

  return (
    <>
      <Button
        size="pill"
        className="gap-xs"
        accessibilityLabel={`Collection total, ${shown}`}
        accessibilityValue={{ text: details.join(', ') }}
        aria-expanded={open}
        onPress={() => setOpen(true)}>
        <Text>{shown}</Text>
        <SymbolView name="chevron.down" size={sizes.totalChevron} tintColor={colors.textMuted} />
      </Button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        accessibilityLabel={['Collection total', shown, ...details, priceCredit(total)].join(', ')}>
        <Text variant="card-title">{shown}</Text>
        <TotalRow label="Since yesterday" value={shownChange(total)} />
        <TotalRow label="Priced" value={shownCoverage(total)} />
        <Text variant="credit">{priceCredit(total)}</Text>
      </Popover>
    </>
  );
}
