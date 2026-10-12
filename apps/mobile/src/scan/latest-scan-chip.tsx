import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/card-thumbnail';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import { scanDetails } from './printing-caption';
import type { BatchScan, Printing } from './scan-batch';
import type { LatestScan } from './scan-batch-state';

type LatestScanChipProps = {
  latest: LatestScan;
  onOpen: (scanId: string) => void;
};

const pulseMs = 650;

function SkeletonChip() {
  const [opacity] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: pulseMs, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: pulseMs, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Recognizing card" style={styles.chip}>
      <Animated.View style={[styles.skeletonImage, { opacity }]} />
      <View style={styles.text}>
        <Animated.View style={[styles.skeletonName, { opacity }]} />
        <Animated.View style={[styles.skeletonDetails, { opacity }]} />
      </View>
    </View>
  );
}

function ChipText({ name, details }: { name: string; details: string[] }) {
  return (
    <View style={styles.text}>
      <Text numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Text numberOfLines={1} style={styles.details}>
        {details.join(' · ')}
      </Text>
    </View>
  );
}

function BasicLandChip({ printing, image }: { printing: Printing; image: string | undefined }) {
  return (
    <View accessible accessibilityLabel={`${printing.name}, Basic land, not tracked`} style={styles.chip}>
      <CardThumbnail uri={image} />
      <ChipText name={printing.name} details={['Basic land, not tracked']} />
    </View>
  );
}

function ScanChip({
  scan,
  image,
  onOpen,
}: {
  scan: BatchScan;
  image: string | undefined;
  onOpen: (scanId: string) => void;
}) {
  const { printing } = scan;
  const name = printing ? printing.name : 'Not recognized';
  const details = printing ? scanDetails({ ...scan, printing }) : ['Tap to search'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, ...details].join(', ')}
      onPress={() => onOpen(scan.scanId)}
      style={styles.chip}>
      <CardThumbnail uri={image} />
      <ChipText name={name} details={details} />
    </Pressable>
  );
}

export function LatestScanChip({ latest, onOpen }: LatestScanChipProps) {
  const printing = latest.kind === 'scan' ? latest.scan.printing : latest.kind === 'basic_land' ? latest.printing : null;
  const imageOf = usePrintingImages(printing ? [printing.printingId] : []);
  const image = printing ? imageOf(printing.printingId) : undefined;
  switch (latest.kind) {
    case 'recognizing':
      return <SkeletonChip />;
    case 'basic_land':
      return <BasicLandChip printing={latest.printing} image={image} />;
    case 'scan':
      return <ScanChip scan={latest.scan} image={image} onOpen={onOpen} />;
  }
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  details: {
    ...typography.meta,
    color: colors.textMuted,
  },
  skeletonImage: {
    width: sizes.cardThumbnailWidth,
    height: sizes.cardThumbnailHeight,
    borderRadius: rounded.xs,
    backgroundColor: colors.line,
  },
  skeletonName: {
    width: '70%',
    height: typography.bodyStrong.fontSize,
    borderRadius: rounded.xs,
    backgroundColor: colors.line,
  },
  skeletonDetails: {
    width: '40%',
    height: typography.meta.fontSize,
    borderRadius: rounded.xs,
    backgroundColor: colors.line,
  },
});
