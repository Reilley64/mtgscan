import { View } from 'react-native';

import { chipLabel, type SearchChip, type SearchSuggestion } from '@/collection/collection-search';
import { Chip } from '@/components/atoms/chip';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { Text } from '@/components/atoms/text';
import { ListRow } from '@/components/molecules/list-row';

type CollectionSearchHeaderProps = {
  chips: SearchChip[];
  refusedChipIndex: number | undefined;
  onRemoveChip: (index: number) => void;
  suggestions: SearchSuggestion[];
  onPickSuggestion: (suggestion: SearchSuggestion) => void;
  countLine: string | undefined;
};

export function CollectionSearchHeader({
  chips,
  refusedChipIndex,
  onRemoveChip,
  suggestions,
  onPickSuggestion,
  countLine,
}: CollectionSearchHeaderProps) {
  if (chips.length === 0 && suggestions.length === 0 && !countLine) {
    return null;
  }
  return (
    <View className="gap-sm pb-sm">
      {chips.length > 0 ? (
        <View className="flex-row flex-wrap gap-sm">
          {chips.map((chip, index) => (
            <Chip
              key={`${index}-${chipLabel(chip)}`}
              label={chipLabel(chip)}
              tone={index === refusedChipIndex ? 'danger' : 'neutral'}
              onRemove={() => onRemoveChip(index)}
            />
          ))}
        </View>
      ) : null}
      {suggestions.map((suggestion) => (
        <ListRow
          key={suggestion.chip?.deckId ?? suggestion.title}
          leading={suggestion.avatar ? <CommanderAvatar uri={suggestion.avatar.uri} size="row" /> : undefined}
          title={suggestion.title}
          detail={suggestion.detail}
          onPress={() => onPickSuggestion(suggestion)}
        />
      ))}
      {countLine ? <Text variant="meta">{countLine}</Text> : null}
    </View>
  );
}
