import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/atoms/button';
import { CountBadge } from '@/components/atoms/count-badge';
import { colors, sizes } from '@/theme';

export function BatchButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Button size="icon" accessibilityLabel={count > 0 ? `Scan batch, ${count}` : 'Scan batch'} onPress={onPress}>
      <SymbolView name="rectangle.portrait.on.rectangle.portrait.angled" size={sizes.iconButtonSymbol} tintColor={colors.text} />
      {count > 0 ? <CountBadge count={count} className="absolute -right-xs -top-xs" /> : null}
    </Button>
  );
}
