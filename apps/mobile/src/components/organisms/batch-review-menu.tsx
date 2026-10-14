import { Stack } from 'expo-router';

import { colors } from '@/theme';

type BatchReviewMenuProps = {
  scanCount: number;
  hidden: boolean;
  onRemoveAll: () => void;
};

export function batchReviewMenu({ scanCount, hidden, onRemoveAll }: BatchReviewMenuProps) {
  return (
    <Stack.Toolbar.Menu
      icon="ellipsis"
      tintColor={colors.text}
      accessibilityLabel="More"
      disabled={scanCount === 0}
      hidden={hidden}>
      <Stack.Toolbar.MenuAction destructive onPress={onRemoveAll}>
        Remove all scans
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
