import { StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from '@/components/secondary-button';
import type { GalleryDelivery, GalleryProgress } from '@/gallery/gallery-state';
import { megabytes } from '@/gallery/megabytes';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import { CameraMessage } from './camera-message';

type GalleryDownloadProps = {
  delivery: GalleryDelivery;
  downloadNow: () => void;
  tryAgain: () => void;
};

function ProgressMessage({
  title,
  progress,
  action,
}: {
  title: string;
  progress: GalleryProgress;
  action?: { label: string; onPress: () => void };
}) {
  const share = progress.bytesTotal > 0 ? progress.bytesDone / progress.bytesTotal : 0;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={title}
        accessibilityValue={{ min: 0, max: progress.bytesTotal, now: progress.bytesDone }}
        style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, share * 100)}%` }]} />
      </View>
      <Text style={styles.amount}>
        {megabytes(progress.bytesDone)} of {megabytes(progress.bytesTotal)}
      </Text>
      {action ? <SecondaryButton label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

export function GalleryDownload({ delivery, downloadNow, tryAgain }: GalleryDownloadProps) {
  const tryAgainAction = { label: 'Try again', onPress: tryAgain };
  switch (delivery.kind) {
    case 'downloading':
      return <ProgressMessage title="Downloading gallery" progress={delivery} />;
    case 'waiting_for_wifi':
      return (
        <ProgressMessage
          title="Waiting for Wi-Fi"
          progress={delivery}
          action={{ label: 'Download now', onPress: downloadNow }}
        />
      );
    case 'paused':
      return (
        <CameraMessage message="Gallery download paused. It continues when you are online." action={tryAgainAction} />
      );
    case 'failed':
      return <CameraMessage message="Gallery download did not work." action={tryAgainAction} />;
    case 'not_enough_space':
      return (
        <CameraMessage
          message={`Not enough space for the gallery. It needs ${megabytes(delivery.bytesNeeded)}.`}
          action={tryAgainAction}
        />
      );
    case 'checking':
    case 'up_to_date':
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: 'center',
  },
  track: {
    height: sizes.progressBar,
    borderRadius: rounded.full,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  amount: {
    ...typography.meta,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
