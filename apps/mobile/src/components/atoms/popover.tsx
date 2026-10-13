import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shadows, sizes, spacing } from '@/theme';

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

export function Popover({ open, onClose, accessibilityLabel, children }: PopoverProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose}>
      <Pressable accessible={false} className="flex-1" onPress={onClose} />
      <View
        accessible
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        onAccessibilityEscape={onClose}
        className="absolute right-lg w-popover-width gap-xs rounded-md bg-surface-raised p-md"
        style={{ top: insets.top + sizes.collapsedHeader + spacing.sm, boxShadow: shadows.popover }}>
        {children}
      </View>
    </Modal>
  );
}
