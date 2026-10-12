import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

export function SetIcon({ uri }: { uri: string }) {
  return (
    <View className="h-set-icon w-set-icon">
      <Image source={uri} tintColor={colors.text} contentFit="contain" cachePolicy="disk" style={StyleSheet.absoluteFill} />
    </View>
  );
}
