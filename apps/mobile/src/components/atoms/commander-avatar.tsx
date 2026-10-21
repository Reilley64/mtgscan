import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { SkeletonImage } from '@/components/atoms/skeleton-image';
import { cn } from '@/lib/class-names';

const avatarVariants = cva('overflow-hidden rounded-full', {
  variants: {
    size: {
      meta: 'size-set-icon',
      tag: 'size-deck-tag-avatar',
      row: 'size-commander-avatar',
      banner: 'size-banner-commander-avatar',
    },
  },
});

type CommanderAvatarProps = {
  uri: string | null;
  size: 'meta' | 'tag' | 'row' | 'banner';
};

export function CommanderAvatar({ uri, size }: CommanderAvatarProps) {
  if (!uri) {
    return <View className={cn(avatarVariants({ size }), dashedOutlineClass)} />;
  }
  return (
    <View className={avatarVariants({ size })}>
      <SkeletonImage uri={uri} />
    </View>
  );
}
