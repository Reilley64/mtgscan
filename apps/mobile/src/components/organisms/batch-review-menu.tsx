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
      <Stack.Toolbar.Menu title="Remove all scans" destructive>
        <Stack.Toolbar.MenuAction destructive onPress={onRemoveAll}>
          {scanCount === 1 ? 'Remove 1 scan' : `Remove ${scanCount} scans`}
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar.Menu>
  );
}
