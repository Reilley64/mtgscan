import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardThumbnail } from '@/components/card-thumbnail';
import { colors, rounded, spacing, typography } from '@/theme';

import { printingCaption } from './printing-caption';
import type { Printing } from './scan-batch';

type PrintingRowProps = {
  printing: Printing;
  image: string | undefined;
  onPress: () => void;
};

export function PrintingRow({ printing, image, onPress }: PrintingRowProps) {
  const caption = printingCaption(printing);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${printing.name}, ${caption}`}
      onPress={onPress}
      style={styles.row}>
      <CardThumbnail uri={image} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>
          {printing.name}
        </Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
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
  caption: {
    ...typography.meta,
    color: colors.textMuted,
  },
});
