import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/class-names';

const surfaceClass = 'rounded-md bg-surface p-card-padding';

type StaticSurfaceProps = Omit<ComponentProps<typeof View>, 'style'> & { onPress?: never };

type PressableSurfaceProps = Omit<ComponentProps<typeof Pressable>, 'style' | 'onPress'> & { onPress: () => void };

export function Surface(props: StaticSurfaceProps | PressableSurfaceProps) {
  if (props.onPress) {
    const { className, ...pressableProps } = props;
    return (
      <Pressable
        accessibilityRole="button"
        className={cn(surfaceClass, 'min-h-touch-target', className)}
        {...pressableProps}
      />
    );
  }
  const { className, ...viewProps } = props as StaticSurfaceProps;
  return <View className={cn(surfaceClass, className)} {...viewProps} />;
}
