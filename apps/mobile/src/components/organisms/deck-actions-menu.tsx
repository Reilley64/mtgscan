import type { DeckPriority } from '@mtgscan/supabase/decks';
import { Stack } from 'expo-router';

import { deckPriorities, priorityNames } from '@/decks/deck-labels';
import { colors } from '@/theme';

type DeckActionsMenuProps = {
  priority: DeckPriority;
  onRename: () => void;
  onSetPriority: (priority: DeckPriority) => void;
  onDelete: () => void;
};

export function deckActionsMenu({ priority, onRename, onSetPriority, onDelete }: DeckActionsMenuProps) {
  return (
    <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.text} accessibilityLabel="More">
      <Stack.Toolbar.MenuAction onPress={onRename}>Rename</Stack.Toolbar.MenuAction>
      <Stack.Toolbar.Menu title="Priority">
        {deckPriorities.map((choice) => (
          <Stack.Toolbar.MenuAction key={choice} isOn={choice === priority} onPress={() => onSetPriority(choice)}>
            {priorityNames[choice]}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
      <Stack.Toolbar.MenuAction destructive onPress={onDelete}>
        Delete deck
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}
