import { View } from 'react-native';

import { CompletionDetails, SetCompletionShare } from '@/components/organisms/set-row';
import { spokenSetSection, type ShownCompletion } from '@/sets/set-completion';

export function SetSectionHeader({ name, completion }: { name: string; completion: ShownCompletion }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={spokenSetSection(name, completion)} className="flex-row items-center gap-md">
      <CompletionDetails name={name} completion={completion} tone="primary" />
      {completion.complete ? <SetCompletionShare completion={completion} /> : null}
    </View>
  );
}
