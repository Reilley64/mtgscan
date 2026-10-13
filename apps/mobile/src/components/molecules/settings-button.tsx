import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/atoms/button';
import { colors, sizes } from '@/theme';

export function SettingsButton() {
  return (
    <Button size="icon" accessibilityLabel="Settings" onPress={() => router.push('/settings')}>
      <SymbolView name="gearshape.fill" size={sizes.iconButtonSymbol} tintColor={colors.text} />
    </Button>
  );
}
