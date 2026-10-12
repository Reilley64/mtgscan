import { StyleSheet, Text, View } from 'react-native';

import { colors, rounded, sizes, spacing, typography } from '@/theme';

import { type GalleryDelivery, useGallery } from './gallery-state';

const galleryDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function deliveryLabel(delivery: GalleryDelivery): string | null {
  switch (delivery.kind) {
    case 'up_to_date':
      return 'Up to date';
    case 'downloading':
      return 'Downloading';
    case 'waiting_for_wifi':
    case 'paused':
    case 'failed':
    case 'not_enough_space':
      return 'Paused';
    case 'checking':
      return null;
  }
}

export function GalleryRow() {
  const { installed, delivery } = useGallery();
  const label = deliveryLabel(delivery);

  return (
    <View style={styles.row}>
      <View style={styles.name}>
        <Text style={styles.title}>Gallery</Text>
        {installed ? <Text style={styles.meta}>{galleryDate.format(new Date(installed.builtAt))}</Text> : null}
      </View>
      {label ? <Text style={styles.meta}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: sizes.cardPadding,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
  },
  name: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  meta: {
    ...typography.meta,
    color: colors.textMuted,
  },
});
