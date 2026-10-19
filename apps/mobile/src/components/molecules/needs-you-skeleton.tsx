import type { ComponentType } from 'react';
import { View } from 'react-native';

import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

type Block = ComponentType<{ className: string }>;

function ChangeLineShape({ block: Block, sign }: { block: Block; sign: string }) {
  return (
    <View className="flex-row items-center gap-sm rounded-sm bg-surface-raised p-sm">
      <Text variant="body-strong" className="text-text-dim">
        {sign}
      </Text>
      <Block className="h-card-thumbnail-height w-card-thumbnail-width rounded-xs" />
      <Block className="h-skeleton-meta-bar w-1/2 rounded-full" />
    </View>
  );
}

export function NeedsYouItemShape({ block: Block }: { block: Block }) {
  return (
    <Surface className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <Block className="h-chip w-chip rounded-full" />
        <Block className="h-skeleton-meta-bar w-1/3 rounded-full" />
      </View>
      <ChangeLineShape block={Block} sign="+" />
      <ChangeLineShape block={Block} sign={'\u2212'} />
    </Surface>
  );
}

export function NeedsYouItemSkeletons() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading Recent" className="gap-lg">
      {[0, 1].map((item) => (
        <NeedsYouItemShape key={item} block={Skeleton} />
      ))}
    </View>
  );
}
