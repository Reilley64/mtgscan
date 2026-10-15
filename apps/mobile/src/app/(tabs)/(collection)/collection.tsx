import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { convertedPrice } from '@mtgscan/supabase/converted-prices';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSetIcons } from '@/catalog/use-set-icons';
import { CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { CollectionSearchHeader } from '@/components/organisms/collection-search-header';
import { CollectionSortButton } from '@/components/organisms/collection-sort-button';
import { collectionFiltersButton, filtersDrawerPath } from '@/components/organisms/collection-filters-button';
import { collectionTotalMenu } from '@/components/organisms/collection-total';
import { TabListScreen } from '@/components/templates/tab-screen';
import { refusedChipMessage, type SearchChip } from '@/collection/collection-search';
import { useCollectionSearchState } from '@/collection/collection-search-state';
import { activeFilterCount } from '@/collection/filter-choices';
import { collectionOrderQuery, defaultCollectionOrder } from '@/collection/collection-sort';
import { sheenOf, shownCondition, spokenFinishAndCondition } from '@/collection/copy-labels';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { priceLabels } from '@/collection/price-currency-labels';
import { shownMatchCount } from '@/collection/total-labels';
import { useCollectionCopies, type BinderRead } from '@/collection/use-collection-copies';
import { useCollectionTotal } from '@/collection/use-collection-total';

type BinderPlaceholderProps = {
  binder: BinderRead;
  searching: boolean;
  refusedChip: SearchChip | undefined;
  onTryAgain: () => void;
};

function BinderPlaceholder({ binder, searching, refusedChip, onTryAgain }: BinderPlaceholderProps) {
  if (refusedChip) {
    return <EmptyState illustration={<EmptyBinderSlots rows={1} />} title={refusedChipMessage(refusedChip)} />;
  }
  if (binder.status === 'failed' || binder.status === 'refused') {
    return (
      <ReadFailure
        illustration={<EmptyBinderSlots rows={1} />}
        title="Could not load your collection"
        onTryAgain={onTryAgain}
      />
    );
  }
  if (binder.status === 'loaded' && searching) {
    return (
      <EmptyState
        illustration={<EmptyBinderSlots rows={1} />}
        title="No cards found"
        message="Check the spelling or try fewer words."
      />
    );
  }
  if (binder.status === 'loaded') {
    return (
      <EmptyState
        illustration={<EmptyBinderSlots rows={2} />}
        title="Your collection is empty"
        message="Scan cards to add them to your collection."
        action={{ label: 'Scan cards', onPress: () => router.navigate('/scan') }}
      />
    );
  }
  return <CardGridSkeleton accessibilityLabel="Loading collection" />;
}

function BinderTile({ copy, setIconUri }: { copy: CollectionCopyRow; setIconUri: string | undefined }) {
  const { priceCurrency } = usePriceCurrency();
  const price = priceLabels(copy.price && priceCurrency && convertedPrice(copy.price, priceCurrency));
  return (
    <CardTile
      uri={copy.image_uris[0]}
      sheen={sheenOf(copy.finish)}
      accessibilityLabel={[
        copy.name,
        `${copy.set.toUpperCase()} ${copy.collector_number}`,
        ...spokenFinishAndCondition(copy),
        ...(copy.protected ? ['protected'] : []),
        price.spoken,
      ].join(', ')}
      accessibilityHint={price.stale ? 'The price may be out of date.' : undefined}
      onPress={() => router.push({ pathname: '/copy', params: { copyId: copy.copy_id } })}>
      <CopyMeta
        setCode={copy.set}
        rarity={copy.rarity}
        setIconUri={setIconUri}
        collectorNumber={copy.collector_number}
        condition={shownCondition(copy.condition)}
        isProtected={copy.protected}
      />
      <PriceLine price={price.shown} stale={price.stale} />
    </CardTile>
  );
}

export default function CollectionScreen() {
  const search = useCollectionSearchState();
  const filtersOpen = usePathname() === filtersDrawerPath;
  const [order, setOrder] = useState(defaultCollectionOrder);
  const { binder, reload, loadMore } = useCollectionCopies(search.query && { ...search.query, ...collectionOrderQuery(order) });
  const suggesting = search.suggestions.length > 0;
  const copies = binder.status === 'loaded' && !suggesting ? binder.copies : [];
  const iconOf = useSetIcons([...new Set(copies.map((copy) => copy.set))]);
  const total = useCollectionTotal();
  const refusedChipIndex = binder.status === 'refused' ? search.chipIndexOfField.get(binder.field) : undefined;
  const matchCount = binder.status === 'loaded' && search.searching ? binder.matchCount : null;
  const showsEmptyState = binder.status !== 'loading' && copies.length === 0;

  return (
    <TabListScreen
      title="Collection"
      actions={[collectionFiltersButton(activeFilterCount(search.chips)), total && total.copies > 0 ? collectionTotalMenu(total) : null]}
      search={search.searchBar}
      ListHeaderComponent={
        <CollectionSearchHeader
          chips={search.chips}
          refusedChipIndex={refusedChipIndex}
          onRemoveChip={search.removeChip}
          suggestions={search.suggestions}
          onPickSuggestion={search.pick}
          countLine={!suggesting && matchCount && total ? shownMatchCount(matchCount, total) : undefined}
        />
      }
      data={copies}
      keyExtractor={(copy) => copy.copy_id}
      numColumns={cardsPerRow}
      columnWrapperClassName={cardRowClass}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <BinderTile copy={item} setIconUri={iconOf(item.set)} />}
      ListEmptyComponent={
        suggesting ? null : (
          <BinderPlaceholder
            binder={binder}
            searching={search.searching}
            refusedChip={refusedChipIndex === undefined ? undefined : search.chips[refusedChipIndex]}
            onTryAgain={reload}
          />
        )
      }
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      floatingButton={
        search.typing || filtersOpen || showsEmptyState ? null : <CollectionSortButton order={order} onChange={setOrder} />
      }
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
