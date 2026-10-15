import { ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { MenuActionButtons, type MenuAction } from '@/components/atoms/menu-button';

type CardContextMenuProps = {
  actions: MenuAction[];
  children: ReactElement;
};

export function CardContextMenu({ actions, children }: CardContextMenuProps) {
  return (
    <View className="aspect-card-image w-full">
      <Host style={StyleSheet.absoluteFill}>
        <ContextMenu>
          <ContextMenu.Trigger>
            <RNHostView>{children}</RNHostView>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            <MenuActionButtons actions={actions} />
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    </View>
  );
}
