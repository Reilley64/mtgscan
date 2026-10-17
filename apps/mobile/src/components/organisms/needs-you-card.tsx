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
import { needsYouLines } from '@/needs-you/needs-you-lines';
import type { NeedsYouItem } from '@/needs-you/use-needs-you';

type NeedsYouCardProps = {
  plan: NeedsYouItem['plan'];
  action: { label: string; busy: boolean; onPress: () => void };
  closing: boolean;
  onOpenDeck?: () => void;
  onClose: () => void;
};

export function NeedsYouCard({ plan, action, closing, onOpenDeck, onClose }: NeedsYouCardProps) {
  const meta = [plan.client_name, shownDayAndTime(plan.created_at)].filter((part) => part !== null).join(' \u00b7 ');
  return (
    <Surface className="gap-sm">
      {onOpenDeck ? <DeckTag name={plan.deck_name} commanderArtUri={plan.commander_art_crop_uri} onPress={onOpenDeck} /> : null}
      {needsYouLines(plan).map(({ key, ...line }) => (
        <ChangeLine key={key} {...line} />
      ))}
      {plan.effect ? <Chip {...effectChip(plan.effect, plan.deck_name)} /> : null}
      <Reason reason={plan.reason} meta={meta} />
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
