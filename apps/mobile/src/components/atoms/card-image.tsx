import { cva } from 'class-variance-authority';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Grayscale } from '@/components/atoms/grayscale';
import { Text } from '@/components/atoms/text';
import { aspectRatios, gradients } from '@/theme';

export const cardHeightPerWidth = 1 / aspectRatios.cardImage;

export type CardSheen = 'foil' | 'etched';

const imageVariants = cva('aspect-card-image overflow-hidden rounded-sm bg-line', {
  variants: {
    dimmed: { true: 'opacity-dimmed' },
  },
});

type CardImageProps = {
  uri: string | undefined;
  quantity?: number;
  sheen?: CardSheen;
  dimmed?: boolean;
};

export function CardImage({ uri, quantity, sheen, dimmed }: CardImageProps) {
  return (
    <View className={imageVariants({ dimmed })}>
      <Image source={uri} recyclingKey={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
      {sheen && <View pointerEvents="none" className="absolute inset-0 opacity-sheen" style={sheenStyles[sheen]} />}
      {dimmed && <Grayscale />}
      {quantity !== undefined && (
        <View className="absolute left-quantity-badge-inset top-quantity-badge-inset h-quantity-badge min-w-quantity-badge items-center justify-center rounded-full bg-quantity-badge px-quantity-badge-inset">
          <Text className="text-tab-label text-text">{quantity}</Text>
        </View>
      )}
    </View>
  );
}

const sheenStyles = StyleSheet.create({
  foil: { experimental_backgroundImage: gradients.foilSheen },
  etched: { experimental_backgroundImage: gradients.etchedSheen },
});
