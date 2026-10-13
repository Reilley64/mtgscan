import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { CountBadge } from '@/components/atoms/count-badge';
import { GlassSurface } from '@/components/atoms/glass-surface';
import { colors, sizes } from '@/theme';

type BatchButtonProps = Pick<ComponentProps<typeof Button>, 'accessibilityActions' | 'onAccessibilityAction'> & {
  count: number;
  onPress: () => void;
};

export function BatchButton({ count, onPress, ...accessibilityActions }: BatchButtonProps) {
  return (
    <View>
      <GlassSurface fallback="surface-control" className="rounded-full" interactive>
        <Button
          size="icon"
          className="bg-transparent"
          accessibilityLabel={count > 0 ? `Scan batch, ${count}` : 'Scan batch'}
          onPress={onPress}
          {...accessibilityActions}>
          <SymbolView name="rectangle.portrait.on.rectangle.portrait.angled" size={sizes.iconButtonSymbol} tintColor={colors.text} />
        </Button>
      </GlassSurface>
      {count > 0 ? <CountBadge count={count} className="absolute -right-xs -top-xs" /> : null}
    </View>
  );
}
