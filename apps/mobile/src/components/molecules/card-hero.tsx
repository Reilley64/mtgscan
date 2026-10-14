import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { CardSheen } from '@/components/atoms/card-image';
import { LargeCardImage } from '@/components/molecules/large-card-image';
import { blurRadii } from '@/theme';

type CardHeroProps = {
  uri: string | undefined;
  artUri: string | undefined;
  name: string;
  sheen?: CardSheen;
};

export function CardHero({ uri, artUri, name, sheen }: CardHeroProps) {
  return (
    <View className="items-center overflow-hidden bg-background pb-lg pt-safe-offset-xl">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-0 opacity-hero-art">
        <Image source={artUri} blurRadius={blurRadii.heroArt} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} />
      </View>
      <LargeCardImage uri={uri} name={name} sheen={sheen} />
    </View>
  );
}
