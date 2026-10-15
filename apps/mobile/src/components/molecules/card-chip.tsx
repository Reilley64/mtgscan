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
