import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, rounded, typography } from '@/theme';

export const cardHeightPerWidth = 680 / 488;

type CardImageProps = {
  uri: string | undefined;
  quantity?: number;
};

export function CardImage({ uri, quantity }: CardImageProps) {
  return (
    <View style={styles.card}>
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
      {quantity !== undefined && <Text style={styles.quantity}>{quantity}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1 / cardHeightPerWidth,
    borderRadius: rounded.sm,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  quantity: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: rounded.full,
    overflow: 'hidden',
    backgroundColor: colors.quantityBadge,
    color: colors.text,
    ...typography.tabLabel,
    lineHeight: 19,
    textAlign: 'center',
  },
});
