import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator } from 'react-native';

import { GlassSurface } from '@/components/atoms/glass-surface';
import { Text } from '@/components/atoms/text';
import { colors, sizes } from '@/theme';

type PullIndicatorProps = {
  label: string;
  symbol: SymbolViewProps['name'] | 'busy';
};

export function PullIndicator({ label, symbol }: PullIndicatorProps) {
  return (
    <GlassSurface fallback="surface-control" className="h-button flex-row items-center gap-sm rounded-full px-md">
      {symbol === 'busy' ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <SymbolView name={symbol} size={sizes.iconButtonSymbol} tintColor={colors.text} />
      )}
      <Text variant="body-strong">{label}</Text>
    </GlassSurface>
  );
}
