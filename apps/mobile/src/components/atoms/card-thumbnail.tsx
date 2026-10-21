import { View } from 'react-native';

import { SkeletonImage } from '@/components/atoms/skeleton-image';

export function CardThumbnail({ uri }: { uri: string | undefined }) {
  return (
    <View className="h-card-thumbnail-height w-card-thumbnail-width overflow-hidden rounded-xs">
      <SkeletonImage uri={uri} />
    </View>
  );
}
