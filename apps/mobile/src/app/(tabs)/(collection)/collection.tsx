import type { BasicLandCard, CollectionCopyRow } from '@mtgscan/supabase/collection';
import { convertedPrice } from '@mtgscan/supabase/converted-prices';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSetIcons } from '@/catalog/use-set-icons';
import { CardGrid, CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { FloatingButton } from '@/components/molecules/floating-button';
import { SortButton } from '@/components/molecules/sort-button';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SheetSection } from '@/components/molecules/sheet-section';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { CollectionSearchHeader } from '@/components/organisms/collection-search-header';
import { collectionFiltersButton, filtersDrawerPath } from '@/components/organisms/collection-filters-button';
import { collectionTotalMenu } from '@/components/organisms/collection-total';
import { TabListScreen } from '@/components/templates/tab-screen';
import { refusedChipMessage, type SearchChip } from '@/collection/collection-search';
import { useCollectionSearchState } from '@/collection/collection-search-state';
import { activeFilterCount } from '@/collection/filter-choices';
import {
  collectionOrderQuery,
  collectionSorts,
  defaultCollectionOrder,
  nextCollectionOrder,
  spokenCollectionOrder,
} from '@/collection/collection-sort';
import { sheenOf, shownCondition, spokenCopy } from '@/collection/copy-labels';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { priceLabels } from '@/collection/price-currency-labels';
import { shownMatchCount } from '@/collection/total-labels';
import { useCollectionCopies, type BinderRead } from '@/collection/use-collection-copies';
import { useCollectionTotal } from '@/collection/use-collection-total';
import { useDecks } from '@/decks/use-decks';

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

type BinderTileProps = {
  copy: CollectionCopyRow;
  setIconUri: string | undefined;
  commanderArtOf: (deckId: string) => string | null;
};

function BinderTile({ copy, setIconUri, commanderArtOf }: BinderTileProps) {
  const { priceCurrency } = usePriceCurrency();
  const price = priceLabels(copy.price && priceCurrency && convertedPrice(copy.price, priceCurrency));
  return (
    <CardTile
      uri={copy.image_uris[0]}
      sheen={sheenOf(copy.finish)}
      accessibilityLabel={[
        ...spokenCopy(copy),
        ...(copy.protected ? ['protected'] : []),
        ...(copy.deck ? [`in the deck ${copy.deck.name}`] : []),
        ...(copy.held_for ? [`held for the deck ${copy.held_for.name}`] : []),
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
        deck={copy.deck ? { commanderArtUri: commanderArtOf(copy.deck.deck_id) } : undefined}
        isHeld={copy.held_for !== null}
      />
      <PriceLine price={price.shown} stale={price.stale} />
    </CardTile>
  );
}

function BasicLandCardTile({ land }: { land: BasicLandCard }) {
  return (
    <CardTile
      uri={land.image_uris[0]}
      unlimited
      accessibilityLabel={`${land.name}, basic land, unlimited`}
      onPress={() => router.push({ pathname: '/add-to-deck', params: { basicLandOracleId: land.oracle_id } })}
    />
  );
}

function BasicLandSection({ lands }: { lands: BasicLandCard[] }) {
  return (
    <View className="pt-lg">
      <SheetSection title="Basic lands">
        <CardGrid>
          {lands.map((land) => (
            <BasicLandCardTile key={land.oracle_id} land={land} />
          ))}
        </CardGrid>
      </SheetSection>
    </View>
  );
}

const nextPageRows = 1;

function BinderFooter({ basicLands, loadingMore }: { basicLands: BasicLandCard[]; loadingMore: boolean }) {
  if (loadingMore) {
    return (
      <View className="pt-sm">
        <CardGridSkeleton accessibilityLabel="Loading more copies" rows={nextPageRows} />
      </View>
    );
  }
  return basicLands.length > 0 ? <BasicLandSection lands={basicLands} /> : null;
}

export default function CollectionScreen() {
  const search = useCollectionSearchState();
  const filtersOpen = usePathname() === filtersDrawerPath;
  const [order, setOrder] = useState(defaultCollectionOrder);
  const { binder: searchedBinder, reload, loadMore } = useCollectionCopies(
    search.query && { ...search.query, ...collectionOrderQuery(order) },
  );
  const binder: BinderRead = search.decksFailed ? { status: 'failed' } : searchedBinder;
  const suggesting = search.suggestions.length > 0;
  const refusedChipIndex =
    search.refusedChipIndex ?? (binder.status === 'refused' && binder.field !== null ? search.chipIndexOfField.get(binder.field) : undefined);
  const refused = refusedChipIndex !== undefined;
  const copies = binder.status === 'loaded' && !suggesting && !refused ? binder.items : [];
  const iconOf = useSetIcons([...new Set(copies.map((copy) => copy.set))]);
  const total = useCollectionTotal();
  const { read: decksRead } = useDecks();
  const commanderArtOf = (deckId: string) =>
    (decksRead.status === 'loaded' && decksRead.decks.find((deck) => deck.deck_id === deckId)?.commanders[0]?.art_crop_uri) || null;
  const basicLands =
    binder.status === 'loaded' && binder.nextCursor === null && !suggesting && !refused ? (binder.firstPage.basic_lands ?? []) : [];
  const matchCount = binder.status === 'loaded' && search.searching && !refused ? binder.firstPage.total_count : null;
  const showsEmptyState = (refused || binder.status !== 'loading') && copies.length === 0 && basicLands.length === 0;
  const showsFloatingButtons = !search.typing && !filtersOpen && !showsEmptyState;

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
      renderItem={({ item }) => <BinderTile copy={item} setIconUri={iconOf(item.set)} commanderArtOf={commanderArtOf} />}
      ListFooterComponent={
        <BinderFooter basicLands={basicLands} loadingMore={binder.status === 'loaded' && binder.loadingMore && copies.length > 0} />
      }
      ListEmptyComponent={
        suggesting || basicLands.length > 0 ? null : (
          <BinderPlaceholder
            binder={binder}
            searching={search.searching}
            refusedChip={refused ? search.chips[refusedChipIndex] : undefined}
            onTryAgain={search.decksFailed ? search.reloadDecks : reload}
          />
        )
      }
      onEndReached={loadMore}
      onEndReachedThreshold={1}
      leftFloatingButtons={
        showsFloatingButtons ? (
          <FloatingButton symbol="rectangle.portrait.on.rectangle.portrait" accessibilityLabel="Sets" onPress={() => router.push('/sets')} />
        ) : null
      }
      floatingButtons={
        showsFloatingButtons ? (
          <SortButton
            sorts={collectionSorts}
            order={order}
            spokenOrder={spokenCollectionOrder(order)}
            active={order.sort !== 'relevance'}
            onSelect={(sort) => setOrder(nextCollectionOrder(order, sort))}
          />
        ) : null
      }
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
