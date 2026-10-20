import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cardHeightPerWidth } from '@/components/atoms/card-image';
import { CardTileSkeleton, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { cn } from '@/lib/class-names';

export const cardListContentClass = 'px-md';

export const cardListRowClass = 'px-xs';

export function fullRowUnlessCard(layout: { span?: number }, item: { kind: string }, _index: number, maxColumns: number) {
  if (item.kind !== 'card') {
    layout.span = maxColumns;
  }
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <View className={cn(cardRowClass, 'flex-row flex-wrap gap-y-sm')}>{children}</View>;
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
