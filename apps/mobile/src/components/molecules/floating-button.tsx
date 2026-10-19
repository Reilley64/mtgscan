import type { SFSymbol } from 'expo-symbols';

import { Button } from '@/components/atoms/button';
import { GlassSurface } from '@/components/atoms/glass-surface';
import { SymbolView } from '@/components/atoms/symbol-view';
import { sizes } from '@/theme';

type FloatingButtonProps = {
  symbol: SFSymbol;
  accessibilityLabel: string;
  onPress: () => void;
};

export function FloatingButton({ symbol, accessibilityLabel, onPress }: FloatingButtonProps) {
  return (
    <GlassSurface fallback="surface-control" className="size-floating-button rounded-full" interactive>
      <Button size="floating" className="bg-transparent" accessibilityLabel={accessibilityLabel} onPress={onPress}>
        <SymbolView name={symbol} size={sizes.iconButtonSymbol} className="text-text" />
      </Button>
    </GlassSurface>
  );
}
