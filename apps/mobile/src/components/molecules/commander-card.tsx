import type { DeckCommander } from '@mtgscan/supabase/decks';
import { cva } from 'class-variance-authority';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { gradients } from '@/theme';

const frameVariants = cva('w-full justify-end gap-sm overflow-hidden rounded-md bg-surface p-md', {
  variants: {
    size: {
      gallery: 'h-commander-gallery-card',
      banner: 'h-deck-banner',
    },
    ghost: {
      true: dashedOutlineClass,
      false: '',
    },
  },
});

type CommanderCardSize = 'gallery' | 'banner';

const secondCommanderAvatarSizes = { gallery: 'row', banner: 'banner' } as const;

export function CommanderCardFrame({ size, children }: { size: CommanderCardSize; children: ReactNode }) {
  return <View className={frameVariants({ size, ghost: true })}>{children}</View>;
}

function CommanderArt({ uri }: { uri: string | null }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-0">
      <Image source={uri} contentFit="cover" cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />
    </View>
  );
}

type CommanderCardProps = {
  name: string;
  chips: string[];
  commanders: DeckCommander[];
  size: CommanderCardSize;
};

export function CommanderCard({ name, chips, commanders, size }: CommanderCardProps) {
  const [commander, secondCommander] = commanders;
  return (
    <View className={frameVariants({ size, ghost: !commander })}>
      {commander ? <CommanderArt uri={commander.art_crop_uri} /> : null}
      {secondCommander ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute right-md top-md">
          <CommanderAvatar uri={secondCommander.art_crop_uri} size={secondCommanderAvatarSizes[size]} />
        </View>
      ) : null}
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

export function CommanderGalleryCard({ name, chips, commanders, onPress }: CommanderGalleryCardProps) {
  return (
    <TileButton accessibilityLabel={[name, ...chips].join(', ')} onPress={onPress}>
      <CommanderCard name={name} chips={chips} commanders={commanders} size="gallery" />
    </TileButton>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gradients.commanderArtScrim,
  },
});
