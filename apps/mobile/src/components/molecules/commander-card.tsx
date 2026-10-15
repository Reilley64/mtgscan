import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { dashedOutlineClass } from '@/components/molecules/empty-state-illustrations';
import { cn } from '@/lib/class-names';

const cardVariants = cva(cn(dashedOutlineClass, 'w-full justify-end gap-sm overflow-hidden rounded-md bg-surface p-md'), {
  variants: {
    size: {
      gallery: 'h-commander-gallery-art',
      banner: 'h-deck-banner',
    },
  },
});

type CommanderCardProps = {
  name: string;
  chips: string[];
  size: 'gallery' | 'banner';
};

export function CommanderCard({ name, chips, size }: CommanderCardProps) {
  return (
    <View className={cardVariants({ size })}>
      <Text variant="card-title" numberOfLines={2}>
        {name}
      </Text>
      <View className="flex-row gap-sm">
        {chips.map((chip) => (
          <Chip key={chip} label={chip} />
        ))}
      </View>
    </View>
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
