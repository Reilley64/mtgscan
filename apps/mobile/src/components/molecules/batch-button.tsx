import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { CountBadge } from '@/components/atoms/count-badge';
import { GlassSurface } from '@/components/atoms/glass-surface';
import { colors, sizes } from '@/theme';

export function BatchButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <View>
      <GlassSurface fallback="surface-control" className="rounded-full" interactive>
        <Button
          size="icon"
          className="bg-transparent"
          accessibilityLabel={count > 0 ? `Scan batch, ${count}` : 'Scan batch'}
          onPress={onPress}>
          <SymbolView name="rectangle.portrait.on.rectangle.portrait.angled" size={sizes.iconButtonSymbol} tintColor={colors.text} />
        </Button>
      </GlassSurface>
      {count > 0 ? <CountBadge count={count} className="absolute -right-xs -top-xs" /> : null}
    </View>
  );
}
