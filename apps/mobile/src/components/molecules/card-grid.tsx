import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cardHeightPerWidth } from '@/components/atoms/card-image';
import { CardTileSkeleton, cardRowClass, cardsPerRow } from '@/components/molecules/card-tile';
import { cn } from '@/lib/class-names';

export function CardGrid({ children }: { children: ReactNode }) {
  return <View className={cn(cardRowClass, 'flex-row flex-wrap gap-y-sm')}>{children}</View>;
}

export function CardTileSkeletons({ imageOnly = false }: { imageOnly?: boolean }) {
  const { width, height } = useWindowDimensions();
  const rows = Math.ceil(height / ((width / cardsPerRow) * cardHeightPerWidth));
  return (
    <CardGrid>
      {Array.from({ length: rows * cardsPerRow }, (_, tile) => (
        <CardTileSkeleton key={tile} imageOnly={imageOnly} />
      ))}
    </CardGrid>
  );
}

export function CardGridSkeleton({ accessibilityLabel }: { accessibilityLabel: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <CardTileSkeletons />
    </View>
  );
}
