import { cva, type VariantProps } from 'class-variance-authority';
import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { StyleSheet, View } from 'react-native';

import { cn } from '@/lib/class-names';

cssInterop(Image, { className: { target: 'style', nativeStyleToProp: { color: 'tintColor' } } });

const rarityTints = cva('text-text', {
  variants: {
    rarity: {
      common: 'text-rarity-common',
      uncommon: 'text-rarity-uncommon',
      rare: 'text-rarity-rare',
      mythic: 'text-rarity-mythic',
      special: 'text-rarity-special',
      bonus: 'text-rarity-special',
    },
  },
});

type SetIconProps = {
  uri: string;
} & VariantProps<typeof rarityTints>;

export function SetIcon({ uri, rarity }: SetIconProps) {
  return (
    <View className="h-set-icon w-set-icon">
      <Image
        source={uri}
        className={cn(rarityTints({ rarity }))}
        contentFit="contain"
        cachePolicy="disk"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
