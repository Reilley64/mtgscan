import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CardImage, type CardSheen } from '@/components/atoms/card-image';
import { Skeleton } from '@/components/atoms/skeleton';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { cn } from '@/lib/class-names';

const columnClasses = { 3: 'w-1/3' } as const;

export const cardsPerRow: keyof typeof columnClasses = 3;

export const cardColumnClass = columnClasses[cardsPerRow];

export const cardRowClass = '-mx-xs';

type CardTileProps = {
  uri: string | undefined;
  accessibilityLabel: string;
  accessibilityHint?: string;
  sheen?: CardSheen;
} & ({ caption: string; children?: never } | { caption?: never; children: ReactNode }) &
  ({ selected?: never; onPress?: never } | { selected?: boolean; onPress: () => void });

export function CardTile({
  uri,
  caption,
  accessibilityLabel,
  accessibilityHint,
  sheen,
  children,
  selected,
  onPress,
}: CardTileProps) {
  const underImage = children ?? (
    <Text variant="meta" numberOfLines={1} className="group-aria-selected/tile:text-primary">
      {caption}
    </Text>
  );

  return (
    <View className={cn(cardColumnClass, 'px-xs')}>
      {onPress ? (
        <TileButton
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          selected={selected}
          onPress={onPress}>
          <View className="rounded-sm border-selected-outline border-transparent group-aria-selected/tile:border-primary">
            <CardImage uri={uri} sheen={sheen} />
          </View>
          {underImage}
        </TileButton>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          className="gap-xs">
          <CardImage uri={uri} sheen={sheen} />
          {underImage}
        </View>
      )}
    </View>
  );
}

export function CardTileSkeleton() {
  return (
    <View className={cn(cardColumnClass, 'gap-xs px-xs')}>
      <Skeleton className="aspect-card-image rounded-sm" />
      <Skeleton className="h-skeleton-meta-bar w-[60%] self-center" />
      <Skeleton className="h-skeleton-meta-bar w-[40%] self-center" />
    </View>
  );
}
