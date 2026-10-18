import { Button, Host, Menu, RNHostView } from '@expo/ui/swift-ui';
import { accessibilityLabel as spokenAs } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { SymbolView } from '@/components/atoms/symbol-view';
import { sizes } from '@/theme';

export type MenuAction = {
  title: string;
  symbol: SFSymbol;
  destructive?: boolean;
  onSelect: () => void;
};

type MenuButtonProps = {
  accessibilityLabel: string;
  actions: MenuAction[];
};

export function MenuActionButtons({ actions }: { actions: MenuAction[] }) {
  return actions.map(({ title, symbol, destructive, onSelect }) => (
    <Button key={title} label={title} systemImage={symbol} role={destructive ? 'destructive' : undefined} onPress={onSelect} />
  ));
}

export function MenuButton({ accessibilityLabel, actions }: MenuButtonProps) {
  return (
    <Host matchContents>
      <Menu
        modifiers={[spokenAs(accessibilityLabel)]}
        label={
          <RNHostView matchContents>
            <View accessibilityElementsHidden className="h-touch-target w-touch-target items-center justify-center">
              <SymbolView name="ellipsis" size={sizes.iconButtonSymbol} className="text-text-muted" />
            </View>
          </RNHostView>
        }>
        <MenuActionButtons actions={actions} />
      </Menu>
    </Host>
  );
}
