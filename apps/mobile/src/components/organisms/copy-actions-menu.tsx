import type { CopyDetails } from '@mtgscan/supabase/collection';
import { Stack } from 'expo-router';

import type { CommanderAction } from '@/decks/commander-actions';
import { colors } from '@/theme';

type CopyActionsMenuProps = {
  copy: Pick<CopyDetails, 'protected' | 'free'>;
  canAddToDeck: boolean;
  commanderAction: CommanderAction | null;
  onSetProtected: (isProtected: boolean) => void;
  onAddToDeck: () => void;
  onSetCommander: (action: CommanderAction) => void;
  onDelete: () => void;
};

export function copyActionsMenu({
  copy,
  canAddToDeck,
  commanderAction,
  onSetProtected,
  onAddToDeck,
  onSetCommander,
  onDelete,
}: CopyActionsMenuProps) {
  return (
    <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.text} accessibilityLabel="More">
      {copy.protected ? (
        <Stack.Toolbar.MenuAction onPress={() => onSetProtected(false)}>Unprotect</Stack.Toolbar.MenuAction>
      ) : null}
      {!copy.protected && copy.free ? (
        <Stack.Toolbar.MenuAction onPress={() => onSetProtected(true)}>Protect</Stack.Toolbar.MenuAction>
      ) : null}
      {copy.free && canAddToDeck ? <Stack.Toolbar.MenuAction onPress={onAddToDeck}>Add to deck</Stack.Toolbar.MenuAction> : null}
      {commanderAction ? (
        <Stack.Toolbar.MenuAction onPress={() => onSetCommander(commanderAction)}>{commanderAction.title}</Stack.Toolbar.MenuAction>
      ) : null}
      <Stack.Toolbar.MenuAction destructive onPress={onDelete}>
        Delete copy
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
