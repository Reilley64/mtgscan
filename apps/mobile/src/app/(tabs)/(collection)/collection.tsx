import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSetIcons } from '@/catalog/use-set-icons';
import { CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { CollectionSearchHeader } from '@/components/organisms/collection-search-header';
import { CollectionSortButton } from '@/components/organisms/collection-sort-button';
import { collectionTotalMenu } from '@/components/organisms/collection-total';
import { TabListScreen } from '@/components/templates/tab-screen';
import { refusedChipMessage, type SearchChip } from '@/collection/collection-search';
import { collectionOrderQuery, defaultCollectionOrder } from '@/collection/collection-sort';
import { sheenOf, shownCondition, shownPrice, spokenFinishAndCondition } from '@/collection/copy-labels';
import { shownMatchCount } from '@/collection/total-labels';
import { useCollectionCopies, type BinderRead } from '@/collection/use-collection-copies';
import { useCollectionSearch } from '@/collection/use-collection-search';
import { useCollectionTotal } from '@/collection/use-collection-total';

type BinderPlaceholderProps = {
  binder: BinderRead;
  searching: boolean;
  refusedChip: SearchChip | undefined;
  onTryAgain: () => void;
};

function BinderPlaceholder({ binder, searching, refusedChip, onTryAgain }: BinderPlaceholderProps) {
  if (refusedChip) {
    return <EmptyState title={refusedChipMessage(refusedChip)} />;
  }
  if (binder.status === 'failed' || binder.status === 'refused') {
    return <ReadFailure title="Could not load your collection" onTryAgain={onTryAgain} />;
  }
  if (binder.status === 'loaded' && searching) {
    return <EmptyState title="No cards found." />;
  }
  if (binder.status === 'loaded') {
    return (
      <EmptyState title="Your collection is empty" message="Scan cards to add them to your collection." />
    );
  }
  return <CardGridSkeleton accessibilityLabel="Loading collection" />;
}

function BinderTile({ copy, setIconUri }: { copy: CollectionCopyRow; setIconUri: string | undefined }) {
  const price = copy.price ? shownPrice(copy.price) : undefined;
  return (
    <CardTile
      uri={copy.image_uris[0]}
      sheen={sheenOf(copy.finish)}
      accessibilityLabel={[
        copy.name,
        `${copy.set.toUpperCase()} ${copy.collector_number}`,
        ...spokenFinishAndCondition(copy),
        price ?? 'no price',
      ].join(', ')}
      accessibilityHint={copy.price?.stale ? 'The price may be out of date.' : undefined}
      onPress={() => router.push({ pathname: '/copy', params: { copyId: copy.copy_id } })}>
      <CopyMeta
        setCode={copy.set}
        rarity={copy.rarity}
        setIconUri={setIconUri}
        collectorNumber={copy.collector_number}
        condition={shownCondition(copy.condition)}
      />
      <PriceLine price={price} stale={copy.price?.stale ?? false} />
    </CardTile>
  );
}

export default function CollectionScreen() {
  const search = useCollectionSearch();
  const [order, setOrder] = useState(defaultCollectionOrder);
  const { binder, reload, loadMore } = useCollectionCopies({ ...search.query, ...collectionOrderQuery(order) });
  const suggesting = search.suggestions.length > 0;
  const copies = binder.status === 'loaded' && !suggesting ? binder.copies : [];
  const iconOf = useSetIcons([...new Set(copies.map((copy) => copy.set))]);
  const total = useCollectionTotal();
  const refusedChipIndex = binder.status === 'refused' ? search.chipIndexOfField.get(binder.field) : undefined;
  const matchCount = binder.status === 'loaded' && search.searching ? binder.matchCount : null;

  return (
    <TabListScreen
      title="Collection"
      actions={total && total.copies > 0 ? collectionTotalMenu(total) : undefined}
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
      floatingButton={search.typing ? null : <CollectionSortButton order={order} onChange={setOrder} />}
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
