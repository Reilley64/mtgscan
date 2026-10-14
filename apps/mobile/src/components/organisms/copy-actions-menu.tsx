import type { CopyDetails } from '@mtgscan/supabase/collection';
import { Stack } from 'expo-router';

import { colors } from '@/theme';

type CopyActionsMenuProps = {
  copy: Pick<CopyDetails, 'protected' | 'free'>;
  onSetProtected: (isProtected: boolean) => void;
  onDelete: () => void;
};

export function copyActionsMenu({ copy, onSetProtected, onDelete }: CopyActionsMenuProps) {
  return (
    <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.text} accessibilityLabel="More">
      {copy.protected ? (
        <Stack.Toolbar.MenuAction onPress={() => onSetProtected(false)}>Unprotect</Stack.Toolbar.MenuAction>
      ) : null}
      {!copy.protected && copy.free ? (
        <Stack.Toolbar.MenuAction onPress={() => onSetProtected(true)}>Protect</Stack.Toolbar.MenuAction>
      ) : null}
      <Stack.Toolbar.MenuAction destructive onPress={onDelete}>
        Delete copy
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
