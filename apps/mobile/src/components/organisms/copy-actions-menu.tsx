import { Stack } from 'expo-router';

import { colors } from '@/theme';

type CopyActionsMenuProps = {
  onDelete: () => void;
};

export function copyActionsMenu({ onDelete }: CopyActionsMenuProps) {
  return (
    <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.text} accessibilityLabel="More">
      <Stack.Toolbar.MenuAction destructive onPress={onDelete}>
        Delete copy
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
