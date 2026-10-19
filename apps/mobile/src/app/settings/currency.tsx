import { router } from 'expo-router';
import { View } from 'react-native';

import { priceCurrencyLabel } from '@/collection/price-currency-labels';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ListRow } from '@/components/molecules/list-row';
import { ReadFailure } from '@/components/molecules/read-failure';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export default function CurrencyScreen() {
  const { priceCurrency, priceCurrencies, reloadPriceCurrencies, setCurrency } = usePriceCurrency();

  return (
    <DrawerSheet title="Currency" belowHeader>
      {priceCurrencies.status === 'loaded' ? (
        <View className="gap-xs">
          {priceCurrencies.items.map((row) => (
            <ListRow
              key={row.currency}
              title={priceCurrencyLabel(row.currency)}
              checked={row.currency === priceCurrency?.currency}
              onPress={() => {
                setCurrency(row.currency);
                router.back();
              }}
            />
          ))}
        </View>
      ) : null}
      {priceCurrencies.status === 'failed' ? (
        <ReadFailure
          illustration={<DashedCardFrame symbol="wifi.slash" />}
          title="Could not load the currencies"
          onTryAgain={reloadPriceCurrencies}
        />
      ) : null}
    </DrawerSheet>
  );
}
