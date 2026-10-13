import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { colors, sizes } from '@/theme';

type PriceLineProps = {
  price: string | undefined;
  stale: boolean;
};

export function PriceLine({ price, stale }: PriceLineProps) {
  return (
    <View className="flex-row items-center justify-center gap-xs">
      {price === undefined ? (
        <Text variant="price" className="text-text-dim">
          –
        </Text>
      ) : (
        <>
          {stale && <SymbolView name="clock" size={sizes.staleSymbol} tintColor={colors.textPrice} />}
          <Text variant="price">{price}</Text>
        </>
      )}
    </View>
  );
}
