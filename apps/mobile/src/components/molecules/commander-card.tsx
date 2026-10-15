import type { DeckCommander } from '@mtgscan/supabase/decks';
import { cva } from 'class-variance-authority';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, StatusChipButton, type StatusChipButtonProps, type StatusChipProps } from '@/components/atoms/chip';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { gradients } from '@/theme';

const ghostVariant = { true: dashedOutlineClass, false: '' };

const cardFrameVariants = cva('h-commander-gallery-card w-full justify-end gap-sm overflow-hidden rounded-md bg-surface p-md', {
  variants: { ghost: ghostVariant },
});

const bannerVariants = cva('w-full overflow-hidden bg-surface pt-safe', {
  variants: { ghost: ghostVariant },
});

export function CommanderCardFrame({ children }: { children: ReactNode }) {
  return <View className={cardFrameVariants({ ghost: true })}>{children}</View>;
}

function CommanderArt({ uri }: { uri: string | null }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute inset-0">
      <Image source={uri} contentFit="cover" cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />
    </View>
  );
}

function SecondCommanderAvatar({ commander, size }: { commander: DeckCommander; size: ComponentProps<typeof CommanderAvatar>['size'] }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <CommanderAvatar uri={commander.art_crop_uri} size={size} />
    </View>
  );
}

type DeckTitleProps = {
  name: string;
  chips: StatusChipProps[];
  chipButtons?: StatusChipButtonProps[];
};

function DeckTitle({ name, chips, chipButtons = [] }: DeckTitleProps) {
  return (
    <>
      <Text variant="card-title" numberOfLines={2}>
        {name}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {chips.map((chip) => (
          <Chip key={chip.label} {...chip} />
        ))}
        {chipButtons.map((chip) => (
          <StatusChipButton key={chip.label} {...chip} />
        ))}
      </View>
    </>
  );
}

type CommanderCardProps = {
  name: string;
  chips: StatusChipProps[];
  commanders: DeckCommander[];
};

function CommanderCard({ name, chips, commanders }: CommanderCardProps) {
  const [commander, secondCommander] = commanders;
  return (
    <View className={cardFrameVariants({ ghost: !commander })}>
      {commander ? <CommanderArt uri={commander.art_crop_uri} /> : null}
      {secondCommander ? (
        <View className="absolute right-md top-md">
          <SecondCommanderAvatar commander={secondCommander} size="row" />
        </View>
      ) : null}
      <DeckTitle name={name} chips={chips} />
    </View>
  );
}

type DeckBannerProps = CommanderCardProps & {
  chipButtons?: StatusChipButtonProps[];
};

export function DeckBanner({ name, chips, chipButtons, commanders }: DeckBannerProps) {
  const [commander, secondCommander] = commanders;
  return (
    <View className={bannerVariants({ ghost: !commander })}>
      {commander ? <CommanderArt uri={commander.art_crop_uri} /> : null}
      <View className="h-deck-banner flex-row items-end gap-md p-lg">
        <View className="flex-1 gap-sm">
          <DeckTitle name={name} chips={chips} chipButtons={chipButtons} />
        </View>
        {secondCommander ? <SecondCommanderAvatar commander={secondCommander} size="banner" /> : null}
      </View>
    </View>
  );
}

type CommanderGalleryCardProps = CommanderCardProps & {
  onPress: () => void;
};

export function CommanderGalleryCard({ name, chips, commanders, onPress }: CommanderGalleryCardProps) {
  return (
    <TileButton accessibilityLabel={[name, ...chips.map((chip) => chip.accessibilityLabel ?? chip.label)].join(', ')} onPress={onPress}>
      <CommanderCard name={name} chips={chips} commanders={commanders} />
    </TileButton>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gradients.commanderArtScrim,
  },
});
