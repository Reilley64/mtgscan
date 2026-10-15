import { cva } from 'class-variance-authority';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { cn } from '@/lib/class-names';

const avatarVariants = cva('overflow-hidden rounded-full', {
  variants: {
    size: {
      tag: 'size-deck-tag-avatar',
      row: 'size-commander-avatar',
      banner: 'size-banner-commander-avatar',
    },
  },
});

type CommanderAvatarProps = {
  uri: string | null;
  size: 'tag' | 'row' | 'banner';
};

export function CommanderAvatar({ uri, size }: CommanderAvatarProps) {
  if (!uri) {
    return <View className={cn(avatarVariants({ size }), dashedOutlineClass)} />;
  }
  return (
    <View className={cn(avatarVariants({ size }), 'bg-line')}>
      <Image source={uri} cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
    </View>
  );
}
