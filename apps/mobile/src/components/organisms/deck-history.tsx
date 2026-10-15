import type { DeckChange } from '@mtgscan/supabase/decks';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ChangeLine } from '@/components/molecules/change-line';
import { changeLineOf, deckChangeKindNames } from '@/decks/deck-change-lines';
import { shownDay, shownDayAndTime } from '@/lib/shown-day';

function DeckChangeCard({ change, onRevert }: { change: DeckChange; onRevert: () => void }) {
  return (
    <Surface className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <View className="flex-1 gap-xs">
          <View className="flex-row items-center gap-sm">
            <Text variant="body-strong">{deckChangeKindNames[change.kind]}</Text>
            {change.reverted ? <Chip label="Reverted" /> : null}
          </View>
          <Text variant="meta">{shownDayAndTime(change.changed_at)}</Text>
        </View>
        <Button variant="danger" onPress={onRevert}>
          <Text>Revert</Text>
        </Button>
      </View>
      {change.lines.map(changeLineOf).map(({ key, ...line }) => (
        <ChangeLine key={key} {...line} />
      ))}
    </Surface>
  );
}

type DeckHistoryProps = {
  changes: DeckChange[];
  createdAt: string;
  onRevert: (change: DeckChange) => void;
};

export function DeckHistory({ changes, createdAt, onRevert }: DeckHistoryProps) {
  return (
    <>
      {changes.map((change) => (
        <DeckChangeCard key={change.deck_change_id} change={change} onRevert={() => onRevert(change)} />
      ))}
      <Text variant="meta">Created {shownDay(createdAt)}</Text>
    </>
  );
}
