import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { CardChips, type CardChipItem } from '@/components/molecules/card-chip';

type BracketSignalRowProps = {
  title: string;
  source: string;
  lowestBracket: string;
  cards: CardChipItem[];
  details: string[];
};

export function BracketSignalRow({ title, source, lowestBracket, cards, details }: BracketSignalRowProps) {
  return (
    <Surface className="gap-sm">
      <View className="flex-row items-baseline gap-sm">
        <Text variant="body-strong" className="flex-1">
          {title}
        </Text>
        <Text className="text-info">{lowestBracket}</Text>
      </View>
      <Text variant="meta">{source}</Text>
      <CardChips cards={cards} />
      {details.map((detail, index) => (
        <Text key={`${index} ${detail}`} variant="meta">
          {detail}
        </Text>
      ))}
    </Surface>
  );
}
