import type { DeckChange } from '@mtgscan/supabase/decks';
import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ChangeLine } from '@/components/molecules/change-line';
import { changeLineOf, deckChangeKindNames } from '@/decks/deck-change-lines';
import { shownDay, shownDayAndTime } from '@/lib/shown-day';

function DeckChangeCard({ change }: { change: DeckChange }) {
  return (
    <Surface className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <Text variant="body-strong">{deckChangeKindNames[change.kind]}</Text>
        {change.reverted ? <Chip label="Reverted" /> : null}
      </View>
      <Text variant="meta">{shownDayAndTime(change.changed_at)}</Text>
      {change.lines.map(changeLineOf).map(({ key, ...line }) => (
        <ChangeLine key={key} {...line} />
      ))}
    </Surface>
  );
}

type DeckHistoryProps = {
  changes: DeckChange[];
  createdAt: string;
};

export function DeckHistory({ changes, createdAt }: DeckHistoryProps) {
  return (
    <>
      {changes.map((change) => (
        <DeckChangeCard key={change.deck_change_id} change={change} />
      ))}
      <Text variant="meta">Created {shownDay(createdAt)}</Text>
    </>
  );
}
