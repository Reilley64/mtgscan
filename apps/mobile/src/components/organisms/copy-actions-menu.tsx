import type { CopyDetails } from '@mtgscan/supabase/collection';
import { Stack } from 'expo-router';

import type { CommanderAction } from '@/decks/commander-actions';
import { colors } from '@/theme';

type CopyActionsMenuProps = {
  copy: Pick<CopyDetails, 'protected' | 'free' | 'deck'>;
  canAddToDeck: boolean;
  commanderAction: CommanderAction | null;
  onSetProtected: (isProtected: boolean) => void;
  onAddToDeck: () => void;
  onSetCommander: (action: CommanderAction) => void;
  onRemoveFromDeck: () => void;
  onDelete: () => void;
};

export function copyActionsMenu({
  copy,
  canAddToDeck,
  commanderAction,
  onSetProtected,
  onAddToDeck,
  onSetCommander,
  onRemoveFromDeck,
  onDelete,
}: CopyActionsMenuProps) {
  return (
    <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.text} accessibilityLabel="More">
      {copy.protected ? (
        <Stack.Toolbar.MenuAction icon="shield.slash" onPress={() => onSetProtected(false)}>Unprotect</Stack.Toolbar.MenuAction>
      ) : null}
      {!copy.protected && copy.free ? (
        <Stack.Toolbar.MenuAction icon="shield" onPress={() => onSetProtected(true)}>Protect</Stack.Toolbar.MenuAction>
      ) : null}
      {copy.free && canAddToDeck ? <Stack.Toolbar.MenuAction icon="plus.rectangle.on.rectangle" onPress={onAddToDeck}>Add to deck</Stack.Toolbar.MenuAction> : null}
      {commanderAction ? (
        <Stack.Toolbar.MenuAction icon={commanderAction.symbol} onPress={() => onSetCommander(commanderAction)}>{commanderAction.title}</Stack.Toolbar.MenuAction>
      ) : null}
      {copy.deck ? <Stack.Toolbar.MenuAction icon="minus.circle" onPress={onRemoveFromDeck}>Remove from deck</Stack.Toolbar.MenuAction> : null}
      <Stack.Toolbar.MenuAction icon="trash" destructive onPress={onDelete}>
        Delete copy
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
