import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CardContextMenu } from '@/components/atoms/card-context-menu';
import { CardImage, type CardSheen } from '@/components/atoms/card-image';
import { CountBadge } from '@/components/atoms/count-badge';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Skeleton } from '@/components/atoms/skeleton';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { cn } from '@/lib/class-names';

const columnClasses = { 3: 'w-1/3' } as const;

export const cardsPerRow: keyof typeof columnClasses = 3;

export const cardColumnClass = columnClasses[cardsPerRow];

export const cardRowClass = '-mx-xs';

const imageOutlineVariants = cva('rounded-sm border-selected-outline border-transparent group-aria-selected/tile:border-primary', {
  variants: {
    inViolation: { true: 'border-danger' },
  },
});

type CardTileProps = {
  uri: string | undefined;
  accessibilityLabel: string;
  accessibilityHint?: string;
  sheen?: CardSheen;
  menuActions?: MenuAction[];
  count?: number;
  inViolation?: boolean;
} & ({ caption: string; children?: never } | { caption?: never; children?: ReactNode }) &
  ({ selected?: never; onPress?: never } | { selected?: boolean; onPress: () => void });

export function CardTile({
  uri,
  caption,
  accessibilityLabel,
  accessibilityHint,
  sheen,
  children,
  selected,
  menuActions,
  count,
  inViolation,
  onPress,
}: CardTileProps) {
  const label = inViolation ? `${accessibilityLabel}, breaks a Commander rule` : accessibilityLabel;

  const image = (
    <View className={cn(imageOutlineVariants({ inViolation }))}>
      <CardImage uri={uri} sheen={sheen} />
      {count === undefined ? null : <CountBadge count={count} prefix="×" className="absolute right-xs top-xs" />}
    </View>
  );

  const underImage =
    caption === undefined ? children : (
      <Text variant="meta" numberOfLines={1} className="group-aria-selected/tile:text-primary">
        {caption}
      </Text>
    );

  function tileButton(onTilePress: () => void) {
    return (
      <TileButton accessibilityLabel={label} accessibilityHint={accessibilityHint} selected={selected} onPress={onTilePress}>
        {image}
        {underImage}
      </TileButton>
    );
  }

  return (
    <View className={cn(cardColumnClass, 'gap-xs px-xs')}>
      {onPress ? (
        menuActions ? (
          <CardContextMenu actions={menuActions}>{tileButton(onPress)}</CardContextMenu>
        ) : (
          tileButton(onPress)
        )
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint}
          className="gap-xs">
          {image}
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
