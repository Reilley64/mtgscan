import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CardImage, type CardSheen } from '@/components/atoms/card-image';
import { blurRadii } from '@/theme';

type CardHeroProps = {
  uri: string | undefined;
  name: string;
  sheen?: CardSheen;
};

export function CardHero({ uri, name, sheen }: CardHeroProps) {
  return (
    <View className="items-center overflow-hidden bg-background pb-lg pt-safe-offset-xl">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-0 opacity-hero-art">
        <Image source={uri} blurRadius={blurRadii.heroArt} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} />
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={name} className="w-[55%]">
        <CardImage uri={uri} sheen={sheen} />
      </View>
    </View>
  );
}
