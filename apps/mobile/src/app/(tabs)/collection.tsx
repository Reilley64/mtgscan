import type { CollectionCopyRow } from '@mtgscan/supabase/collection';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { TabListScreen } from '@/components/templates/tab-screen';
import { copyBadges } from '@/collection/copy-labels';
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

function BinderTile({ copy }: { copy: CollectionCopyRow }) {
  const caption = `${copy.set.toUpperCase()} ${copy.collector_number}`;
  const badges = copyBadges(copy);
  return (
    <CardTile
      uri={copy.image_uris[0]}
      caption={caption}
      badges={badges}
      accessibilityLabel={[copy.name, caption, ...badges].join(', ')}
    />
  );
}

export default function CollectionScreen() {
  const { binder, reload, loadMore } = useCollectionCopies();

  return (
    <TabListScreen
      title="Collection"
      data={binder.status === 'loaded' ? binder.copies : []}
      keyExtractor={(copy) => `${copy.collection_entry_id}:${copy.copy_number}`}
      numColumns={cardsPerRow}
      columnWrapperClassName={cardRowClass}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <BinderTile copy={item} />}
      ListEmptyComponent={<BinderPlaceholder binder={binder} onTryAgain={reload} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
