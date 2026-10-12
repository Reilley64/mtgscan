import { megabytes } from '@mtgscan/supabase/gallery-manifest';
import { View } from 'react-native';

import { ProgressBar } from '@/components/atoms/progress-bar';
import { Text } from '@/components/atoms/text';
import type { GalleryDelivery, GalleryProgress } from '@/gallery/gallery-state';

import { CameraMessage } from './camera-message';

type GalleryDownloadProps = {
  delivery: GalleryDelivery;
  downloadNow: () => void;
  tryAgain: () => void;
};

function ProgressMessage({
  message,
  progress,
  action,
}: {
  message: string;
  progress: GalleryProgress;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <CameraMessage message={message} action={action}>
      <View className="gap-sm">
        <ProgressBar label={message} value={progress.bytesDone} max={progress.bytesTotal} />
        <Text variant="meta" className="text-center">
          {megabytes(progress.bytesDone)} of {megabytes(progress.bytesTotal)}
        </Text>
      </View>
    </CameraMessage>
  );
}

export function GalleryDownload({ delivery, downloadNow, tryAgain }: GalleryDownloadProps) {
  const tryAgainAction = { label: 'Try again', onPress: tryAgain };
  switch (delivery.kind) {
    case 'downloading':
      return <ProgressMessage message="Downloading gallery" progress={delivery} />;
    case 'waiting_for_wifi':
      return (
        <ProgressMessage
          message="Waiting for Wi-Fi"
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
