import type { SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

const warningSymbols = {
  protected: { name: 'shield.fill', size: sizes.protectedSymbol },
  held: { name: 'bookmark.fill', size: sizes.heldSymbol },
} satisfies Record<string, { name: SFSymbol; size: number }>;

export function WarningLine({ message, symbol = 'protected' }: { message: string; symbol?: keyof typeof warningSymbols }) {
  return (
    <View accessible accessibilityLabel={message} className="flex-row items-center gap-sm">
      <SymbolView {...warningSymbols[symbol]} className="text-warning" />
      <Text className="flex-1 text-warning">{message}</Text>
    </View>
  );
}
