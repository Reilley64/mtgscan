import type { DeckChange } from '@mtgscan/supabase/decks';

import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ActionRow } from '@/components/molecules/action-row';
import { ChangeLine } from '@/components/molecules/change-line';
import { changeLineOf, deckChangeKindNames } from '@/decks/deck-change-lines';
import { shownDay, shownDayAndTime } from '@/lib/shown-day';

function DeckChangeCard({ change, onRevert }: { change: DeckChange; onRevert: () => void }) {
  return (
    <Surface className="gap-sm">
      <ActionRow
        title={deckChangeKindNames[change.kind]}
        badge={change.reverted ? { content: <Chip label="Reverted" />, spoken: 'Reverted' } : undefined}
        detail={shownDayAndTime(change.changed_at)}
        action={{ label: 'Revert', variant: 'danger', onPress: onRevert }}
      />
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
