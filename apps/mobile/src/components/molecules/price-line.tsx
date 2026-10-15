import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { useOnGlass } from '@/components/atoms/glass-surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

const priceTones = cva('', {
  variants: {
    tone: {
      price: 'text-text-price',
      meta: 'text-text-muted',
    },
    onGlass: {
      true: '',
      false: '',
    },
  },
  compoundVariants: [{ tone: 'meta', onGlass: true, className: 'text-glass-text-muted' }],
});

const missingPriceTones = cva('', {
  variants: {
    onGlass: {
      true: 'text-glass-text-dim',
      false: 'text-text-dim',
    },
  },
});

type PriceLineProps = {
  price: string | undefined;
  stale: boolean;
  tone?: 'price' | 'meta';
};

export function PriceLine({ price, stale, tone = 'price' }: PriceLineProps) {
  const onGlass = useOnGlass();
  const toneClass = priceTones({ tone, onGlass });
  return (
    <View className="flex-row items-center justify-center gap-xs">
      {price === undefined ? (
        <Text variant="price" className={missingPriceTones({ onGlass })}>
          –
        </Text>
      ) : (
        <>
          {stale && <SymbolView name="clock" size={sizes.staleSymbol} className={toneClass} />}
          <Text variant="price" className={toneClass}>
            {price}
          </Text>
        </>
      )}
    </View>
  );
}
