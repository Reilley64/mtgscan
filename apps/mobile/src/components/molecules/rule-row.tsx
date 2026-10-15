import { cva, type VariantProps } from 'class-variance-authority';
import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { CardChips, type CardChipItem } from '@/components/molecules/card-chip';

const ruleVariants = cva('flex-1', {
  variants: {
    tone: {
      danger: 'text-danger',
      warning: 'text-warning',
    },
  },
});

type RuleRowProps = Required<VariantProps<typeof ruleVariants>> & {
  rule: string;
  citation?: { label: string; onPress: () => void };
  message: string;
  cards: CardChipItem[];
  hint?: string | null;
};

export function RuleRow({ tone, rule, citation, message, cards, hint }: RuleRowProps) {
  return (
    <Surface className="gap-sm">
      <View className="flex-row items-baseline gap-sm">
        <Text variant="body-strong" className={ruleVariants({ tone })}>
          {rule}
        </Text>
        {citation ? (
          <Text variant="body-strong">
            <TextLink onPress={citation.onPress}>{citation.label}</TextLink>
          </Text>
        ) : null}
      </View>
      <Text variant="meta">{message}</Text>
      <CardChips cards={cards} />
      {hint ? <Text variant="meta">{hint}</Text> : null}
    </Surface>
  );
}
