import { View } from 'react-native';

import { CardTileSkeletons } from '@/components/molecules/card-grid';
import { SetRowSkeleton } from '@/components/molecules/set-row';

export function SetSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading set" className="gap-lg">
      <SetRowSkeleton />
      <CardTileSkeletons imageOnly />
    </View>
  );
}
