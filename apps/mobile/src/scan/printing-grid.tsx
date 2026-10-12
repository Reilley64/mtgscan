import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardImage } from '@/components/atoms/card-image';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import { printingCaption } from './printing-caption';
import type { Printing } from './scan-batch';

const printingsPerRow = 3;

type PrintingGridProps = {
  printings: readonly Printing[];
  selectedId?: string;
  onChoose: (printing: Printing) => void;
};

export function PrintingGrid({ printings, selectedId, onChoose }: PrintingGridProps) {
  const { width } = useWindowDimensions();
  const imageOf = usePrintingImages(printings.map((printing) => printing.printingId));
  const tileWidth = (width - spacing.lg * 2 - spacing.sm * (printingsPerRow - 1)) / printingsPerRow;

  return (
    <View style={styles.grid}>
      {printings.map((printing) => {
        const caption = printingCaption(printing);
        const selected = printing.printingId === selectedId;
        return (
          <Pressable
            key={printing.printingId}
            accessibilityRole="button"
            accessibilityLabel={`${printing.name}, ${caption}`}
            accessibilityState={{ selected }}
            onPress={() => onChoose(printing)}
            style={[styles.tile, { width: tileWidth }]}>
            <View style={[styles.image, selected && styles.selectedImage]}>
              <CardImage uri={imageOf(printing.printingId)} />
            </View>
            <Text numberOfLines={1} style={[styles.caption, selected && styles.selectedCaption]}>
              {caption}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    gap: spacing.xs,
  },
  image: {
    borderRadius: rounded.sm,
    borderWidth: sizes.selectedOutline,
    borderColor: 'transparent',
  },
  selectedImage: {
    borderColor: colors.primary,
  },
  caption: {
    ...typography.meta,
    color: colors.textMuted,
  },
  selectedCaption: {
    color: colors.primary,
  },
});
