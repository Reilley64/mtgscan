import type { ReactNode } from 'react';
import { View } from 'react-native';

import { GlassSurface } from '@/components/atoms/glass-surface';
import { Surface } from '@/components/atoms/surface';

const sideColumnClass = 'w-card-thumbnail-width items-center justify-center';

const surfaceClass = 'bg-transparent p-sm';

type ThumbnailChipProps = {
  thumbnail: ReactNode;
  accessory?: ReactNode;
  accessibilityLabel: string;
  accessibilityRole?: 'progressbar';
  onPress?: () => void;
  children: ReactNode;
};

export function ThumbnailChip({ thumbnail, accessory, onPress, children, ...accessibility }: ThumbnailChipProps) {
  const columns = (
    <View className="flex-row items-center gap-md">
      <View className={sideColumnClass}>{thumbnail}</View>
      <View className="flex-1">{children}</View>
      <View className={sideColumnClass}>{accessory}</View>
    </View>
  );
  return (
    <GlassSurface fallback="surface" className="rounded-md" interactive={onPress !== undefined}>
      {onPress ? (
        <Surface onPress={onPress} className={surfaceClass} {...accessibility}>
          {columns}
        </Surface>
      ) : (
        <Surface accessible className={surfaceClass} {...accessibility}>
          {columns}
        </Surface>
      )}
    </GlassSurface>
  );
}
