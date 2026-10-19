import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

const sides = cva('absolute flex-row gap-sm', {
  variants: {
    side: {
      left: 'left-lg',
      right: 'right-lg',
    },
  },
});

type FloatingButtonsProps = Required<VariantProps<typeof sides>> & { children: ReactNode };

export function FloatingButtons({ side, children }: FloatingButtonsProps) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View className={sides({ side })} style={{ bottom: bottom + spacing.lg }}>
      {children}
    </View>
  );
}
