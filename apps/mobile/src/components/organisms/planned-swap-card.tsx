import type { PlannedSwap } from '@mtgscan/supabase/planned-swaps';

import { Button } from '@/components/atoms/button';
import { Chip } from '@/components/atoms/chip';
import { DeckTag } from '@/components/atoms/deck-tag';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ChangeLine } from '@/components/molecules/change-line';
import { Reason } from '@/components/molecules/reason';
import { effectChip } from '@/decks/deck-labels';
import { shownDayAndTime } from '@/lib/shown-day';
import { plannedSwapLines } from '@/planned-swaps/planned-swap-lines';

type PlannedSwapCardProps = {
  plannedSwap: PlannedSwap;
  swappingIn: boolean;
  onOpenDeck: () => void;
  onSwapIn: () => void;
};

export function PlannedSwapCard({ plannedSwap, swappingIn, onOpenDeck, onSwapIn }: PlannedSwapCardProps) {
  const meta = [plannedSwap.client_name, shownDayAndTime(plannedSwap.created_at)].filter((part) => part !== null).join(' \u00b7 ');
  return (
    <Surface className="gap-sm">
      <DeckTag name={plannedSwap.deck_name} commanderArtUri={plannedSwap.commander_art_crop_uri} onPress={onOpenDeck} />
      {plannedSwapLines(plannedSwap).map(({ key, ...line }) => (
        <ChangeLine key={key} {...line} />
      ))}
      {plannedSwap.effect ? <Chip {...effectChip(plannedSwap.effect, plannedSwap.deck_name)} /> : null}
      <Reason reason={plannedSwap.reason} meta={meta} />
      <Button variant="primary" className="self-start" busy={swappingIn} onPress={onSwapIn}>
        <Text>Swap in</Text>
      </Button>
    </Surface>
  );
}
