import { View } from 'react-native';

import { CardTileSkeletons } from '@/components/molecules/card-grid';
import { SetBannerSkeleton } from '@/components/molecules/set-banner-skeleton';

export function SetSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading set" className="gap-lg">
      <SetBannerSkeleton size="header" />
      <CardTileSkeletons imageOnly />
    </View>
  );
}
