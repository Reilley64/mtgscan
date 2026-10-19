import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { ProgressBar } from '@/components/atoms/progress-bar';
import { SetSymbolFill } from '@/components/atoms/set-symbol-fill';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { setRowClass } from '@/components/molecules/set-row-skeleton';
import { completionShare, isComplete } from '@/sets/set-completion';

const outlines = cva(setRowClass, {
  variants: {
    complete: {
      true: 'border-primary',
      false: 'border-transparent',
    },
  },
});

const shares = cva('text-sheet-title', {
  variants: {
    complete: {
      true: 'text-primary',
      false: 'text-text',
    },
  },
});

export function SetCompletionShare({ complete, percent }: { complete: boolean; percent: number | null }) {
  if (!complete && percent === null) {
    return null;
  }
  return <Text className={shares({ complete })}>{complete ? '✓' : `${percent}%`}</Text>;
}

type SetCompletionProps = {
  name: string;
  symbolUri: string;
  owned: number;
  size: number;
  percent: number | null;
  accessibilityLabel: string;
};

function SetCompletionContent({ name, symbolUri, owned, size, percent }: Omit<SetCompletionProps, 'accessibilityLabel'>) {
  const count = `${owned} of ${size}`;
  return (
    <>
      <SetSymbolFill uri={symbolUri} share={completionShare({ owned, size })} />
      <View className="flex-1 gap-xs">
        <Text variant="body-strong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta">{count}</Text>
        <ProgressBar label={count} value={owned} max={size} tone="primary" />
      </View>
      <SetCompletionShare complete={isComplete({ owned, size })} percent={percent} />
    </>
  );
}

export function SetRow({ accessibilityLabel, onPress, ...completion }: SetCompletionProps & { onPress: () => void }) {
  return (
    <Surface
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={outlines({ complete: isComplete(completion) })}>
      <SetCompletionContent {...completion} />
    </Surface>
  );
}

export function SetHeader({ accessibilityLabel, ...completion }: SetCompletionProps) {
  return (
    <Surface
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel}
      className={outlines({ complete: isComplete(completion) })}>
      <SetCompletionContent {...completion} />
    </Surface>
  );
}
