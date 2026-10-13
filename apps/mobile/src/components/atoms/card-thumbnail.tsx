import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { placeholderFills, useOnGlass } from '@/components/atoms/glass-surface';
import { cn } from '@/lib/class-names';

export function CardThumbnail({ uri }: { uri: string | undefined }) {
  const onGlass = useOnGlass();
  return (
    <View
      className={cn('h-card-thumbnail-height w-card-thumbnail-width overflow-hidden rounded-xs', placeholderFills({ onGlass }))}>
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
    </View>
  );
}
