import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cardHeightPerWidth } from '@/components/atoms/card-image';
import { CardTileSkeleton, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { cn } from '@/lib/class-names';

export function inCardRows<Card>(cards: Card[]): Card[][] {
  return Array.from({ length: Math.ceil(cards.length / cardsPerRow) }, (_, row) =>
    cards.slice(row * cardsPerRow, (row + 1) * cardsPerRow),
  );
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
