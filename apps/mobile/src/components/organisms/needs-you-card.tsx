import type { DeckChangeEffect } from '@mtgscan/supabase/decks';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Chip } from '@/components/atoms/chip';
import { DeckTag } from '@/components/atoms/deck-tag';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ChangeLine } from '@/components/molecules/change-line';
import { Reason } from '@/components/molecules/reason';
import { effectChip } from '@/decks/deck-labels';
import { shownDayAndTime } from '@/lib/shown-day';
import type { NeedsYouLine } from '@/needs-you/needs-you-lines';

type NeedsYouCardProps = {
  deckName: string;
  commanderArtUri: string | null;
  lines: NeedsYouLine[];
  effect: DeckChangeEffect | null;
  reason: string;
  clientName: string | null;
  createdAt: string;
  action: { label: string; busy: boolean; onPress: () => void };
  closing: boolean;
  onOpenDeck: () => void;
  onClose: () => void;
};

export function NeedsYouCard({
  deckName,
  commanderArtUri,
  lines,
  effect,
  reason,
  clientName,
  createdAt,
  action,
  closing,
  onOpenDeck,
  onClose,
}: NeedsYouCardProps) {
  const meta = [clientName, shownDayAndTime(createdAt)].filter((part) => part !== null).join(' \u00b7 ');
  return (
    <Surface className="gap-sm">
      <DeckTag name={deckName} commanderArtUri={commanderArtUri} onPress={onOpenDeck} />
      {lines.map(({ key, ...line }) => (
        <ChangeLine key={key} {...line} />
      ))}
      {effect ? <Chip {...effectChip(effect, deckName)} /> : null}
      <Reason reason={reason} meta={meta} />
      <View className="flex-row gap-sm">
        <Button variant="primary" busy={action.busy} onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
        <Button variant="secondary" busy={closing} onPress={onClose}>
          <Text>Close</Text>
        </Button>
      </View>
    </Surface>
  );
}
