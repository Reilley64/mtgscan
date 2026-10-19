import { View } from 'react-native';

import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { cn } from '@/lib/class-names';

export const setRowClass = 'flex-row items-center gap-md border-selected-outline';

export function SetRowSkeleton() {
  return (
    <Surface className={cn(setRowClass, 'border-transparent')}>
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
