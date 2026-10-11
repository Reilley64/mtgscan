import type { CollectionPrintingRow } from '@mtgscan/supabase/collection';
import { StyleSheet, Text, View } from 'react-native';

import { CardImage } from '@/components/card-image';
import { colors, spacing, typography } from '@/theme';

type BinderTileProps = {
  printing: CollectionPrintingRow;
  width: number;
};

export function BinderTile({ printing, width }: BinderTileProps) {
  const caption = `${printing.set.toUpperCase()} ${printing.collector_number}`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${printing.name}, ${caption}, ${printing.owned_quantity} owned`}
      style={[styles.tile, { width }]}>
      <CardImage uri={printing.image_uris[0]} quantity={printing.owned_quantity} />
      <Text numberOfLines={1} style={styles.caption}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: spacing.xs,
  },
  caption: {
    ...typography.meta,
    color: colors.textMuted,
  },
});
