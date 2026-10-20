import type { CardSet, FinishView } from '@mtgscan/supabase/sets';
import { cva, type VariantProps } from 'class-variance-authority';
import { View } from 'react-native';

import { ProgressBar } from '@/components/atoms/progress-bar';
import { SetSymbolFill } from '@/components/atoms/set-symbol-fill';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { setCompletionIn, spokenSet, type ShownCompletion } from '@/sets/set-completion';

const setRowClass = 'flex-row items-center gap-md border-selected-outline';

export const setOutlines = {
  complete: {
    true: 'border-primary',
    false: 'border-transparent',
  },
};

const outlines = cva(setRowClass, { variants: setOutlines });

const shares = cva('text-sheet-title', {
  variants: {
    complete: {
      true: 'text-primary',
      false: 'text-text',
    },
  },
});

export function SetCompletionShare({ completion: { complete, percent } }: { completion: ShownCompletion }) {
  if (!complete && percent === null) {
    return null;
  }
  return <Text className={shares({ complete })}>{complete ? '✓' : `${percent}%`}</Text>;
}

export type SetCompletionProps = {
  set: CardSet;
  finishView: FinishView;
};

const completionNames = cva('', {
  variants: {
    tone: {
      text: '',
      primary: 'text-primary',
    },
  },
});

type CompletionDetailsProps = VariantProps<typeof completionNames> & { name: string; completion: ShownCompletion };

export function CompletionDetails({ name, completion, tone }: CompletionDetailsProps) {
  return (
    <View className="flex-1 gap-xs">
      <Text variant="body-strong" className={completionNames({ tone })} numberOfLines={1}>
        {name}
      </Text>
      <Text variant="meta">{completion.count}</Text>
      <ProgressBar label={completion.count} value={completion.owned} max={completion.size} tone="primary" />
    </View>
  );
}

function SetCompletionContent({ set, completion }: { set: CardSet; completion: ShownCompletion }) {
  return (
    <>
      <SetSymbolFill uri={set.icon_svg_uri} share={completion.share} />
      <CompletionDetails name={set.name} completion={completion} />
      <SetCompletionShare completion={completion} />
    </>
  );
}

export function SetRow({ set, finishView, onPress }: SetCompletionProps & { onPress: () => void }) {
  const completion = setCompletionIn(set, finishView);
  return (
    <Surface accessibilityLabel={spokenSet(set.name, completion)} onPress={onPress} className={outlines({ complete: completion.complete })}>
      <SetCompletionContent set={set} completion={completion} />
    </Surface>
  );
}

export function SetHeader({ set, finishView }: SetCompletionProps) {
  const completion = setCompletionIn(set, finishView);
  return (
    <Surface
      accessible
      accessibilityRole="header"
      accessibilityLabel={spokenSet(set.name, completion)}
      className={outlines({ complete: completion.complete })}>
      <SetCompletionContent set={set} completion={completion} />
    </Surface>
  );
}
