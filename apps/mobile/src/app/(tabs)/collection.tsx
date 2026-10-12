import type { CollectionPrintingRow } from '@mtgscan/supabase/collection';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { CardTile, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { TabListScreen } from '@/components/templates/tab-screen';
import { useCollectionPrintings, type BinderRead } from '@/collection/use-collection-printings';

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

function BinderTile({ printing }: { printing: CollectionPrintingRow }) {
  const caption = `${printing.set.toUpperCase()} ${printing.collector_number}`;
  return (
    <CardTile
      uri={printing.image_uris[0]}
      caption={caption}
      quantity={printing.owned_quantity}
      accessibilityLabel={`${printing.name}, ${caption}, ${printing.owned_quantity} owned`}
    />
  );
}

export default function CollectionScreen() {
  const { binder, reload, loadMore } = useCollectionPrintings();

  return (
    <TabListScreen
      title="Collection"
      data={binder.status === 'loaded' ? binder.printings : []}
      keyExtractor={(printing) => printing.printing_id}
      numColumns={cardsPerRow}
      columnWrapperClassName={cardRowClass}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <BinderTile printing={item} />}
      ListEmptyComponent={<BinderPlaceholder binder={binder} onTryAgain={reload} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
