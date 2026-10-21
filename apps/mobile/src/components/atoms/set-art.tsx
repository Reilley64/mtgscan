import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Grayscale } from '@/components/atoms/grayscale';
import { Skeleton } from '@/components/atoms/skeleton';
import { imageSkeletonClass, useImageLoading } from '@/components/atoms/skeleton-image';
import { gradients } from '@/theme';

type SetArtProps = {
  uri: string;
  share: number;
};

export function SetArt({ uri, share }: SetArtProps) {
  const { loading, onLoadEnd } = useImageLoading(uri);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-0">
      {loading ? <Skeleton className={imageSkeletonClass} /> : null}
      <View className="absolute inset-0 opacity-dimmed">
        <Image source={uri} contentFit="cover" cachePolicy="disk" transition={200} onLoadEnd={onLoadEnd} style={StyleSheet.absoluteFill} />
        <Grayscale />
      </View>
      {share > 0 && (
        <View className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${share * 100}%` }}>
          <View className="absolute inset-y-0 left-0" style={{ width: `${100 / share}%` }}>
            <Image source={uri} contentFit="cover" cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
          </View>
          {share < 1 && <View className="absolute inset-y-0 right-0 w-selected-outline bg-primary" />}
        </View>
      )}
      <View style={styles.scrim} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gradients.setArtScrim,
  },
});
