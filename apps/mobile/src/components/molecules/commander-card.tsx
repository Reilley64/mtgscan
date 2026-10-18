import type { DeckCommander } from '@mtgscan/supabase/decks';
import { cva } from 'class-variance-authority';
import { Image } from 'expo-image';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, StatusChipButton, type StatusChipButtonProps, type StatusChipProps } from '@/components/atoms/chip';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { CountBadge } from '@/components/atoms/count-badge';
import { dashedOutlineClass } from '@/components/atoms/dashed-outline';
import { Skeleton } from '@/components/atoms/skeleton';
import { Text } from '@/components/atoms/text';
import { TileButton } from '@/components/atoms/tile-button';
import { gradients } from '@/theme';

const ghostVariant = { true: dashedOutlineClass, false: '' };

const cardFrameVariants = cva('min-h-commander-gallery-card w-full justify-end gap-sm overflow-hidden rounded-md bg-surface p-md pt-xl', {
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
      <View className="min-h-deck-banner flex-row items-end gap-md p-lg pt-header-clearance">
        <View className="flex-1 gap-sm">
          <DeckTitle name={name} chips={chips} chipButtons={chipButtons} />
        </View>
        {secondCommander ? <SecondCommanderAvatar commander={secondCommander} size="banner" /> : null}
      </View>
    </View>
  );
}

export function CommanderTitleShape({ block: Block }: { block: ComponentType<{ className: string }> }) {
  return (
    <>
      <Block className="h-skeleton-title-bar w-1/2 rounded-full" />
      <View className="flex-row gap-sm">
        <Block className="h-chip w-1/6 rounded-md" />
        <Block className="h-chip w-1/5 rounded-md" />
      </View>
    </>
  );
}

export function DeckBannerSkeleton() {
  return (
    <View className={bannerVariants({ ghost: false })}>
      <View className="h-deck-banner justify-end gap-sm p-lg">
        <CommanderTitleShape block={Skeleton} />
      </View>
    </View>
  );
}

export function CommanderGalleryCardSkeletons() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading decks" className="gap-lg">
      {[0, 1, 2].map((card) => (
        <View key={card} className={cardFrameVariants({ ghost: false })}>
          <CommanderTitleShape block={Skeleton} />
        </View>
      ))}
    </View>
  );
}

type CommanderGalleryCardProps = CommanderCardProps & {
  needsYouCount?: number;
  onPress: () => void;
};

export function CommanderGalleryCard({ name, chips, commanders, needsYouCount = 0, onPress }: CommanderGalleryCardProps) {
  const needsYou = needsYouCount > 0 ? [`Needs you ${needsYouCount}`] : [];
  return (
    <TileButton
      accessibilityLabel={[name, ...needsYou, ...chips.map((chip) => chip.accessibilityLabel ?? chip.label)].join(', ')}
      accessibilityHint={chips.find((chip) => chip.accessibilityHint)?.accessibilityHint}
      onPress={onPress}>
      <CommanderCard name={name} chips={chips} commanders={commanders} />
      {needsYouCount > 0 ? <CountBadge count={needsYouCount} className="absolute left-md top-md" /> : null}
    </TileButton>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: gradients.commanderArtScrim,
  },
});
