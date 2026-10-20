import { Children, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cardHeightPerWidth } from '@/components/atoms/card-image';
import { FlashList, type FlashListProps } from '@/components/atoms/flash-list';
import { CardTileSkeleton, cardColumnClass, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { cn } from '@/lib/class-names';

const gridInsets = {
  content: 'px-md',
  fullRow: 'px-xs',
  edgeToEdge: '-mx-md',
};

const headerInsets = { 'full-row': gridInsets.fullRow, 'edge-to-edge': gridInsets.edgeToEdge };

export type CardGridListProps<Item> = Omit<
  FlashListProps<Item>,
  'numColumns' | 'overrideItemLayout' | 'ListHeaderComponentClassName' | 'ListFooterComponentClassName' | 'ListEmptyComponentClassName'
> & {
  isTile: (item: Item) => boolean;
  header?: keyof typeof headerInsets;
};

export function CardGridList<Item>({ isTile, header = 'full-row', renderItem, contentContainerClassName, ...listProps }: CardGridListProps<Item>) {
  const { height } = useWindowDimensions();
  return (
    <FlashList
      drawDistance={height * 2}
      {...listProps}
      numColumns={cardsPerRow}
      overrideItemLayout={(layout, item, _index, maxColumns) => {
        if (!isTile(item)) {
          layout.span = maxColumns;
        }
      }}
      renderItem={
        renderItem && ((info) => (isTile(info.item) ? renderItem(info) : <View className={gridInsets.fullRow}>{renderItem(info)}</View>))
      }
      contentContainerClassName={cn(gridInsets.content, contentContainerClassName)}
      ListHeaderComponentClassName={headerInsets[header]}
      ListFooterComponentClassName={gridInsets.fullRow}
      ListEmptyComponentClassName={gridInsets.fullRow}
    />
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <View className={cn(cardRowClass, 'flex-row flex-wrap gap-y-sm')}>
      {Children.map(children, (tile) => (
        <View className={cardColumnClass}>{tile}</View>
      ))}
    </View>
  );
}

type CardTileSkeletonsProps = {
  imageOnly?: boolean;
  rows?: number;
};

export function CardTileSkeletons({ imageOnly = false, rows }: CardTileSkeletonsProps) {
  const { width, height } = useWindowDimensions();
  const rowCount = rows ?? Math.ceil(height / ((width / cardsPerRow) * cardHeightPerWidth));
  return (
    <CardGrid>
      {Array.from({ length: rowCount * cardsPerRow }, (_, tile) => (
        <CardTileSkeleton key={tile} imageOnly={imageOnly} />
      ))}
    </CardGrid>
  );
}

type CardGridSkeletonProps = {
  accessibilityLabel: string;
  rows?: number;
};

export function CardGridSkeleton({ accessibilityLabel, rows }: CardGridSkeletonProps) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <CardTileSkeletons rows={rows} />
    </View>
  );
}
