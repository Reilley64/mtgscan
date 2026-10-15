import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { cn } from '@/lib/class-names';

const frameVariants = cva(cn(dashedOutlineClass, 'w-full justify-end gap-sm overflow-hidden rounded-md bg-surface p-md'), {
  variants: {
    size: {
      gallery: 'h-commander-gallery-card',
      banner: 'h-deck-banner',
    },
  },
});

type CommanderCardSize = 'gallery' | 'banner';

export function CommanderCardFrame({ size, children }: { size: CommanderCardSize; children: ReactNode }) {
  return <View className={frameVariants({ size })}>{children}</View>;
}

type CommanderCardProps = {
  name: string;
  chips: string[];
  size: CommanderCardSize;
};

export function CommanderCard({ name, chips, size }: CommanderCardProps) {
  return (
    <CommanderCardFrame size={size}>
      <Text variant="card-title" numberOfLines={2}>
        {name}
      </Text>
      <View className="flex-row gap-sm">
        {chips.map((chip) => (
          <Chip key={chip} label={chip} />
        ))}
      </View>
    </CommanderCardFrame>
  );
}

type CommanderGalleryCardProps = Omit<CommanderCardProps, 'size'> & {
  onPress: () => void;
};

export function CommanderGalleryCard({ name, chips, onPress }: CommanderGalleryCardProps) {
  return (
    <TileButton accessibilityLabel={[name, ...chips].join(', ')} onPress={onPress}>
      <CommanderCard name={name} chips={chips} size="gallery" />
    </TileButton>
  );
}
