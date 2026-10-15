import { View } from 'react-native';

import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

export function WarningLine({ message }: { message: string }) {
  return (
    <View accessible accessibilityLabel={message} className="flex-row items-center gap-sm">
      <SymbolView name="shield.fill" size={sizes.protectedSymbol} className="text-warning" />
      <Text className="flex-1 text-warning">{message}</Text>
    </View>
  );
}
