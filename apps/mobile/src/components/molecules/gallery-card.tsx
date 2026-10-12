import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

type GalleryCardProps = {
  date: string | null;
  status: string | null;
};

export function GalleryCard({ date, status }: GalleryCardProps) {
  return (
    <Surface className="flex-row items-center gap-md">
      <View className="flex-1 gap-xs">
        <Text variant="body-strong">Gallery</Text>
        {date ? <Text variant="meta">{date}</Text> : null}
      </View>
      {status ? <Text variant="meta">{status}</Text> : null}
    </Surface>
  );
}
