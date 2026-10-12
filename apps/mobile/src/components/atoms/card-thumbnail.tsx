import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, rounded, sizes } from '@/theme';

export function CardThumbnail({ uri }: { uri: string | undefined }) {
  return (
    <View style={styles.thumbnail}>
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: sizes.cardThumbnailWidth,
    height: sizes.cardThumbnailHeight,
    borderRadius: rounded.xs,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
});
