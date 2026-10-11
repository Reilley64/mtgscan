import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { BinderTile } from '@/components/binder-tile';
import { EmptyState } from '@/components/empty-state';
import { SecondaryButton } from '@/components/secondary-button';
import { TabListScreen } from '@/components/tab-screen';
import { useCollectionPrintings, type Binder } from '@/collection/use-collection-printings';
import { spacing } from '@/theme';

const tilesPerRow = 3;

function BinderPlaceholder({ binder, onTryAgain }: { binder: Binder; onTryAgain: () => void }) {
  if (binder.status === 'failed') {
    return (
      <View style={styles.placeholder}>
        <EmptyState title="Could not load your collection" message="Check your connection." />
        <SecondaryButton label="Try again" onPress={onTryAgain} />
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

export default function CollectionScreen() {
  const { binder, reload, loadMore } = useCollectionPrintings();
  const { width } = useWindowDimensions();
  const tileWidth = (width - 2 * spacing.lg - (tilesPerRow - 1) * spacing.sm) / tilesPerRow;

  return (
    <TabListScreen
      title="Collection"
      data={binder.status === 'loaded' ? binder.printings : []}
      keyExtractor={(printing) => printing.printing_id}
      numColumns={tilesPerRow}
      columnWrapperStyle={styles.row}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <BinderTile printing={item} width={tileWidth} />}
      ListEmptyComponent={<BinderPlaceholder binder={binder} onTryAgain={reload} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
    />
  );
}

function RowGap() {
  return <View style={styles.rowGap} />;
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
  },
  rowGap: {
    height: spacing.sm,
  },
  placeholder: {
    gap: spacing.lg,
  },
});
