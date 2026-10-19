import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { ProgressBar } from '@/components/atoms/progress-bar';
import { SetSymbolFill } from '@/components/atoms/set-symbol-fill';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

const rowClass = 'flex-row items-center gap-md border-selected-outline';

const outlines = cva(rowClass, {
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

export function SetCompletionShare({ complete, percent }: { complete: boolean; percent: number }) {
  return <Text className={shares({ complete })}>{complete ? '✓' : `${percent}%`}</Text>;
}

type SetCompletionProps = {
  name: string;
  symbolUri: string;
  owned: number;
  size: number;
  percent: number;
  accessibilityLabel: string;
};

function SetCompletionContent({ name, symbolUri, owned, size, percent }: Omit<SetCompletionProps, 'accessibilityLabel'>) {
  const count = `${owned} of ${size}`;
  return (
    <>
      <SetSymbolFill uri={symbolUri} share={owned / size} />
      <View className="flex-1 gap-xs">
        <Text variant="body-strong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta">{count}</Text>
        <ProgressBar label={count} value={owned} max={size} tone="primary" />
      </View>
      <SetCompletionShare complete={owned === size} percent={percent} />
    </>
  );
}

export function SetRow({ accessibilityLabel, onPress, ...completion }: SetCompletionProps & { onPress: () => void }) {
  return (
    <Surface
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={outlines({ complete: completion.owned === completion.size })}>
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
      className={outlines({ complete: completion.owned === completion.size })}>
      <SetCompletionContent {...completion} />
    </Surface>
  );
}

export function SetRowSkeleton() {
  return (
    <Surface className={outlines({ complete: false })}>
      <Skeleton className="size-set-symbol-fill rounded-sm" />
      <View className="flex-1 gap-xs">
        <Skeleton className="h-skeleton-title-bar w-[60%]" />
        <Skeleton className="h-skeleton-meta-bar w-[30%]" />
        <Skeleton className="h-progress-bar w-full rounded-full" />
      </View>
    </Surface>
  );
}

const skeletonRows = 8;

export function SetListSkeleton({ accessibilityLabel }: { accessibilityLabel: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} className="gap-sm">
      {Array.from({ length: skeletonRows }, (_, row) => (
        <SetRowSkeleton key={row} />
      ))}
    </View>
  );
}
