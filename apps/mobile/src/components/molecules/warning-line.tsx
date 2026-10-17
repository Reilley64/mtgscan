import type { SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

export function WarningLine({ message, symbol = 'shield.fill' }: { message: string; symbol?: SFSymbol }) {
  return (
    <View accessible accessibilityLabel={message} className="flex-row items-center gap-sm">
      <SymbolView name={symbol} size={sizes.protectedSymbol} className="text-warning" />
      <Text className="flex-1 text-warning">{message}</Text>
    </View>
  );
}
