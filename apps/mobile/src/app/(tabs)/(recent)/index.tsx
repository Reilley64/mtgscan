import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ChipGroup } from '@/components/molecules/chip-group';
import { EmptyState } from '@/components/molecules/empty-state';
import { GhostNeedsYouItems } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { NeedsYouCard } from '@/components/organisms/needs-you-card';
import { TabScreen } from '@/components/templates/tab-screen';
import { closeBuylistCard } from '@/buylist/buylist-writes';
import { needsYouLines } from '@/needs-you/needs-you-lines';
import { useNeedsYou, type NeedsYouItem } from '@/needs-you/use-needs-you';
import { closePlannedSwap, swapInPlannedSwap } from '@/planned-swaps/planned-swap-writes';

const needsYouFilters = ['all', 'planned_swap', 'buylist_card'] as const;

type NeedsYouFilter = (typeof needsYouFilters)[number];

const needsYouFilterLabels: Record<NeedsYouFilter, string> = {
  all: 'All',
  planned_swap: 'Planned swaps',
  buylist_card: 'Buylist',
};

function idOf(item: NeedsYouItem) {
  return item.kind === 'planned_swap' ? item.plannedSwap.planned_swap_id : item.buylistCard.buylist_card_id;
}

export default function RecentScreen() {
  const { read, reload } = useNeedsYou();
  const [filter, setFilter] = useState<NeedsYouFilter>('all');
  const [swappingIn, setSwappingIn] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const items = read.status === 'loaded' ? read.items : [];

  async function swapIn(plannedSwapId: string) {
    setSwappingIn(plannedSwapId);
    const result = await swapInPlannedSwap(plannedSwapId);
    setSwappingIn(null);
    if (result === 'failed') {
      Alert.alert('Could not swap in this card', 'Check your connection.');
    } else if (result === 'commander_limit') {
      Alert.alert('Could not swap in this card', 'A deck has at most two commanders.');
    } else {
      reload();
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
      reload();
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
        onOpenDeck={() => router.push({ pathname: '/deck', params: { deckId: plan.deck_id } })}
        onClose={() => void close(item)}
      />
    );
  }

  return (
    <TabScreen title="Recent">
      {read.status === 'failed' ? (
        <ReadFailure illustration={<GhostNeedsYouItems />} title="Could not load Recent" onTryAgain={reload} />
      ) : null}
      {read.status === 'loaded' && items.length === 0 ? (
        <EmptyState
          illustration={<GhostNeedsYouItems />}
          title="Nothing needs you yet"
          message="When a deck needs you, it shows up here."
        />
      ) : null}
      {items.length > 0 ? (
        <ChipGroup values={needsYouFilters} selected={filter} labelOf={(value) => needsYouFilterLabels[value]} onSelect={setFilter} />
      ) : null}
      {items.filter((item) => filter === 'all' || item.kind === filter).map(cardOf)}
    </TabScreen>
  );
}
