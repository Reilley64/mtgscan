import { View } from 'react-native';

import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Text } from '@/components/atoms/text';

export type CardChipProps = {
  uri: string | undefined;
  name: string;
};

export function CardChip({ uri, name }: CardChipProps) {
  return (
    <View accessible accessibilityLabel={name} className="flex-row items-center gap-sm self-start rounded-md bg-surface-raised p-xs pr-chip-padding">
      <CardThumbnail uri={uri} />
      <Text variant="chip">{name}</Text>
    </View>
  );
}

export type CardChipItem = CardChipProps & { key: string };

export function CardChips({ cards }: { cards: CardChipItem[] }) {
  if (cards.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-xs">
      {cards.map(({ key, ...card }) => (
        <CardChip key={key} {...card} />
      ))}
    </View>
  );
}
