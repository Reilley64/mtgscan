import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function CardThumbnail({ uri }: { uri: string | undefined }) {
  return (
    <View className="h-card-thumbnail-height w-card-thumbnail-width overflow-hidden rounded-xs bg-line">
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
    </View>
  );
}
