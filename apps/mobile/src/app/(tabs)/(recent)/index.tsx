import { router } from 'expo-router';
import { useState } from 'react';

import { ChipGroup } from '@/components/molecules/chip-group';
import { EmptyState } from '@/components/molecules/empty-state';
import { GhostNeedsYouItems } from '@/components/molecules/empty-state-illustrations';
import { NeedsYouItemSkeletons } from '@/components/molecules/needs-you-skeleton';
import { ReadFailure } from '@/components/molecules/read-failure';
import { NeedsYouList } from '@/components/organisms/needs-you-list';
import { TabScreen } from '@/components/templates/tab-screen';
import { useNeedsYou } from '@/needs-you/use-needs-you';

const needsYouFilters = ['all', 'planned_swap', 'buylist_card'] as const;

type NeedsYouFilter = (typeof needsYouFilters)[number];

const needsYouFilterLabels: Record<NeedsYouFilter, string> = {
  all: 'All',
  planned_swap: 'Planned swaps',
  buylist_card: 'Buylist',
};

function openPlanned(deckId: string) {
  router.push({ pathname: '/deck', params: { deckId, tab: 'planned' } });
}

export default function RecentScreen() {
  const { read, reload } = useNeedsYou();
  const [filter, setFilter] = useState<NeedsYouFilter>('all');
  const items = read.status === 'loaded' ? read.items : [];

  return (
    <TabScreen title="Recent">
      {read.status === 'loading' ? <NeedsYouItemSkeletons /> : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<GhostNeedsYouItems />} title="Could not load Recent" onTryAgain={reload} />
      ) : null}
      {read.status === 'loaded' && items.length === 0 ? (
        <EmptyState
          illustration={<GhostNeedsYouItems />}
          title="Nothing needs you yet"
          message="Planned swaps and buylist cards from your AI chat show up here."
        />
      ) : null}
      {items.length > 0 ? (
        <ChipGroup values={needsYouFilters} selected={filter} labelOf={(value) => needsYouFilterLabels[value]} onSelect={setFilter} />
      ) : null}
      <NeedsYouList
        items={items.filter((item) => filter === 'all' || item.kind === filter)}
        onChanged={reload}
        onOpenDeck={openPlanned}
      />
    </TabScreen>
  );
}
