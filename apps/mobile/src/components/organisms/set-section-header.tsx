import { View } from 'react-native';

import { ProgressBar } from '@/components/atoms/progress-bar';
import { Text } from '@/components/atoms/text';
import { spokenSetSection, type ShownCompletion } from '@/sets/set-completion';

export function SetSectionHeader({ name, completion }: { name: string; completion: ShownCompletion }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={spokenSetSection(name, completion)} className="gap-xs">
      <View className="flex-row items-baseline gap-sm">
        <Text variant="body-strong" className="shrink text-primary" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta">{completion.count}</Text>
        {completion.complete ? (
          <Text variant="body-strong" className="ml-auto text-primary">
            ✓
          </Text>
        ) : null}
      </View>
      <ProgressBar label={completion.count} value={completion.owned} max={completion.size} tone="primary" />
    </View>
  );
}
