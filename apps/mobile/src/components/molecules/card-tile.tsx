import { View } from 'react-native';

import { CardImage } from '@/components/atoms/card-image';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { cn } from '@/lib/class-names';

export const cardsPerRow = 3;

export const cardRowClass = '-mx-xs';

type CardTileProps = {
  uri: string | undefined;
  caption: string;
  accessibilityLabel: string;
  quantity?: number;
} & ({ selected?: never; onPress?: never } | { selected: boolean; onPress: () => void });

export function CardTile({ uri, caption, accessibilityLabel, quantity, selected, onPress }: CardTileProps) {
  const captionText = (
    <Text variant="meta" numberOfLines={1} className={cn(selected && 'text-primary')}>
      {caption}
    </Text>
  );

  return (
    <View className="w-1/3 px-xs">
      {onPress ? (
        <TileButton accessibilityLabel={accessibilityLabel} selected={selected} onPress={onPress}>
          <View className={cn('rounded-sm border-selected-outline', selected ? 'border-primary' : 'border-transparent')}>
            <CardImage uri={uri} quantity={quantity} />
          </View>
          {captionText}
        </TileButton>
      ) : (
        <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} className="gap-xs">
          <CardImage uri={uri} quantity={quantity} />
          {captionText}
        </View>
      )}
    </View>
  );
}
