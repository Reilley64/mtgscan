import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { aspectRatios } from '@/theme';

export const cardHeightPerWidth = 1 / aspectRatios.cardImage;

type CardImageProps = {
  uri: string | undefined;
  badges?: string[];
};

export function CardImage({ uri, badges = [] }: CardImageProps) {
  return (
    <View className="aspect-card-image overflow-hidden rounded-sm bg-line">
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
      {badges.length > 0 && (
        <View className="absolute left-quantity-badge-inset top-quantity-badge-inset flex-row gap-xs">
          {badges.map((badge) => (
            <View
              key={badge}
              className="h-quantity-badge min-w-quantity-badge items-center justify-center rounded-full bg-quantity-badge px-quantity-badge-inset">
              <Text className="text-tab-label text-text">{badge}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
