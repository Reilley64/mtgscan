import { View } from 'react-native';

import { Skeleton } from '@/components/atoms/skeleton';
import { CardTileSkeletons } from '@/components/molecules/card-grid';
import { DeckBannerSkeleton } from '@/components/molecules/commander-card';

export function DeckSkeleton({ showsCards }: { showsCards: boolean }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading deck" className="gap-lg">
      <DeckBannerSkeleton />
      <View className="gap-lg px-lg">
        <Skeleton className="h-button rounded-sm" />
        {showsCards ? (
          <View className="gap-sm">
            <Skeleton className="h-skeleton-title-bar w-[30%]" />
            <CardTileSkeletons imageOnly />
          </View>
        ) : null}
      </View>
    </View>
  );
}
