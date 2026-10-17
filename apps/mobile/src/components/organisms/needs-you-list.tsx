import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { NeedsYouCard } from '@/components/organisms/needs-you-card';
import { closeBuylistCard } from '@/buylist/buylist-writes';
import type { WriteResult } from '@/lib/write-result';
import type { NeedsYouItem } from '@/needs-you/use-needs-you';
import { closePlannedSwap, swapInPlannedSwap } from '@/planned-swaps/planned-swap-writes';

type NeedsYouListProps = {
  items: NeedsYouItem[];
  onChanged: () => void;
  onOpenDeck?: (deckId: string) => void;
};

const closes: Record<NeedsYouItem['kind'], (id: string) => Promise<WriteResult>> = {
  planned_swap: closePlannedSwap,
  buylist_card: closeBuylistCard,
};

const closeFailures: Record<NeedsYouItem['kind'], string> = {
  planned_swap: 'Could not close this planned swap',
  buylist_card: 'Could not close this buylist card',
};

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

  async function close({ kind, id }: NeedsYouItem) {
    setClosing(id);
    const result = await closes[kind](id);
    setClosing(null);
    if (result === 'failed') {
      Alert.alert(closeFailures[kind], 'Check your connection.');
    } else {
      onChanged();
    }
  }

  function actionOf(item: NeedsYouItem) {
    if (item.kind === 'planned_swap') {
      return { label: 'Swap in', busy: swappingIn === item.id, onPress: () => void swapIn(item.id) };
    }
    return {
      label: 'Bought',
      busy: false,
      onPress: () =>
        router.push({ pathname: '/bought', params: { buylistCardId: item.id, oracleId: item.plan.incoming.oracle_id } }),
    };
  }

  return items.map((item) => (
    <NeedsYouCard
      key={item.id}
      plan={item.plan}
      action={actionOf(item)}
      closing={closing === item.id}
      onOpenDeck={onOpenDeck && (() => onOpenDeck(item.plan.deck_id))}
      onClose={() => void close(item)}
    />
  ));
}
