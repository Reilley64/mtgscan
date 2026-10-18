import { View } from 'react-native';

import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';

function ChangeLineSkeleton() {
  return (
    <View className="flex-row items-center gap-md rounded-sm bg-surface-raised p-sm">
      <Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />
      <Skeleton className="h-skeleton-title-bar w-1/2" />
    </View>
  );
}

export function NeedsYouItemSkeletons() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading Recent" className="gap-lg">
      {[0, 1].map((item) => (
        <Surface key={item} className="gap-sm">
          <View className="flex-row items-center gap-xs">
            <Skeleton className="size-deck-tag-avatar rounded-full" />
            <Skeleton className="h-skeleton-meta-bar w-1/3" />
          </View>
          <ChangeLineSkeleton />
          <ChangeLineSkeleton />
        </Surface>
      ))}
    </View>
  );
}
