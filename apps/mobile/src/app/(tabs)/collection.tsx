import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { View } from 'react-native';

import { useSetIcons } from '@/catalog/use-set-icons';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { EmptyState } from '@/components/molecules/empty-state';
import { TabListScreen } from '@/components/templates/tab-screen';
import { shownCondition, shownPrice, spokenFinishAndCondition } from '@/collection/copy-labels';
import { useCollectionCopies, type BinderRead } from '@/collection/use-collection-copies';

function BinderPlaceholder({ binder, onTryAgain }: { binder: BinderRead; onTryAgain: () => void }) {
  if (binder.status === 'failed') {
    return (
      <View className="gap-lg">
        <EmptyState title="Could not load your collection" message="Check your connection." />
        <Button onPress={onTryAgain}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }
  if (binder.status === 'loaded') {
    return (
      <EmptyState title="Your collection is empty" message="Scan cards to add them to your collection." />
    );
  }
  return null;
}

function BinderTile({ copy, setIconUri }: { copy: CollectionCopyRow; setIconUri: string | undefined }) {
  const price = copy.price ? shownPrice(copy.price) : undefined;
  return (
    <CardTile
      uri={copy.image_uris[0]}
      sheen={copy.finish === 'nonfoil' ? undefined : copy.finish}
      accessibilityLabel={[
        copy.name,
        `${copy.set.toUpperCase()} ${copy.collector_number}`,
        ...spokenFinishAndCondition(copy),
        price ?? 'no price',
      ].join(', ')}
      accessibilityHint={copy.price?.stale ? 'The price may be out of date.' : undefined}>
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
  const { binder, reload, loadMore } = useCollectionCopies();
  const copies = binder.status === 'loaded' ? binder.copies : [];
  const iconOf = useSetIcons([...new Set(copies.map((copy) => copy.set))]);

  return (
    <TabListScreen
      title="Collection"
      data={copies}
      keyExtractor={(copy) => `${copy.collection_entry_id}:${copy.copy_number}`}
      numColumns={cardsPerRow}
      columnWrapperClassName={cardRowClass}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <BinderTile copy={item} setIconUri={iconOf(item.set)} />}
      ListEmptyComponent={<BinderPlaceholder binder={binder} onTryAgain={reload} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
