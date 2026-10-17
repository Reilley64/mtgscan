import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { NeedsYouCard } from '@/components/organisms/needs-you-card';
import { closeBuylistCard } from '@/buylist/buylist-writes';
import { needsYouLines } from '@/needs-you/needs-you-lines';
import type { NeedsYouItem } from '@/needs-you/use-needs-you';
import { closePlannedSwap, swapInPlannedSwap } from '@/planned-swaps/planned-swap-writes';

type NeedsYouListProps = {
  items: NeedsYouItem[];
  onChanged: () => void;
  onOpenDeck?: (deckId: string) => void;
};

function idOf(item: NeedsYouItem) {
  return item.kind === 'planned_swap' ? item.plannedSwap.planned_swap_id : item.buylistCard.buylist_card_id;
}

export function NeedsYouList({ items, onChanged, onOpenDeck }: NeedsYouListProps) {
  const [swappingIn, setSwappingIn] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  async function swapIn(plannedSwapId: string) {
    setSwappingIn(plannedSwapId);
    const result = await swapInPlannedSwap(plannedSwapId);
    setSwappingIn(null);
    if (result === 'failed') {
      Alert.alert('Could not swap in this card', 'Check your connection.');
    } else if (result === 'commander_limit') {
      Alert.alert('Could not swap in this card', 'A deck has at most two commanders.');
    } else {
      onChanged();
    }
  }

  async function close(item: NeedsYouItem) {
    setClosing(idOf(item));
    const result =
      item.kind === 'planned_swap'
        ? await closePlannedSwap(item.plannedSwap.planned_swap_id)
        : await closeBuylistCard(item.buylistCard.buylist_card_id);
    setClosing(null);
    if (result === 'failed') {
      Alert.alert(item.kind === 'planned_swap' ? 'Could not close this planned swap' : 'Could not close this buylist card', 'Check your connection.');
    } else {
      onChanged();
    }
  }

  function cardOf(item: NeedsYouItem) {
    const plan = item.kind === 'planned_swap' ? item.plannedSwap : item.buylistCard;
    const action =
      item.kind === 'planned_swap'
        ? {
            label: 'Swap in',
            busy: swappingIn === item.plannedSwap.planned_swap_id,
            onPress: () => void swapIn(item.plannedSwap.planned_swap_id),
          }
        : {
            label: 'Bought',
            busy: false,
            onPress: () =>
              router.push({
                pathname: '/bought',
                params: { buylistCardId: item.buylistCard.buylist_card_id, oracleId: item.buylistCard.incoming.oracle_id },
              }),
          };
    return (
      <NeedsYouCard
        key={idOf(item)}
        deckName={plan.deck_name}
        commanderArtUri={plan.commander_art_crop_uri}
        lines={needsYouLines(plan)}
        effect={plan.effect}
        reason={plan.reason}
        clientName={plan.client_name}
        createdAt={plan.created_at}
        action={action}
        closing={closing === idOf(item)}
        onOpenDeck={onOpenDeck && (() => onOpenDeck(plan.deck_id))}
        onClose={() => void close(item)}
      />
    );
  }

  return items.map(cardOf);
}
