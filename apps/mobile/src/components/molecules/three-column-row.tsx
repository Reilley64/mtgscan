import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/class-names';

type ThreeColumnRowProps = {
  start?: ReactNode;
  end?: ReactNode;
  sideClassName: string;
  children: ReactNode;
};

export function ThreeColumnRow({ start, end, sideClassName, children }: ThreeColumnRowProps) {
  const sideClass = cn('items-center justify-center', sideClassName);
  return (
    <View className="flex-row items-center gap-md">
      <View className={sideClass}>{start}</View>
      <View className="flex-1">{children}</View>
      <View className={sideClass}>{end}</View>
    </View>
  );
}
