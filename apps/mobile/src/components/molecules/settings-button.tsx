import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/atoms/button';
import { colors } from '@/theme';

export function SettingsButton() {
  return (
    <Button size="icon" accessibilityLabel="Settings" onPress={() => router.push('/settings')}>
      <SymbolView name="gearshape.fill" size={18} tintColor={colors.text} />
    </Button>
  );
}
