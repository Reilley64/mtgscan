import { Pressable } from 'react-native';

import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { verticalTouchSlop } from '@/components/atoms/control-style';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

type DeckTagProps = {
  name: string;
  commanderArtUri: string | null;
  onPress: () => void;
};

export function DeckTag({ name, commanderArtUri, onPress }: DeckTagProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint="Opens the deck."
      hitSlop={verticalTouchSlop(sizes.chip)}
      onPress={onPress}
      className="h-chip min-w-touch-target flex-row items-center gap-xs self-start rounded-full bg-surface-control pl-xs pr-chip-padding">
      <CommanderAvatar uri={commanderArtUri} size="tag" />
      <Text variant="chip" numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}
