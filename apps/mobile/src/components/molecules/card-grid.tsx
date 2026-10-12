import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cardRowClass } from '@/components/molecules/card-tile';
import { cn } from '@/lib/class-names';

export function CardGrid({ children }: { children: ReactNode }) {
  return <View className={cn(cardRowClass, 'flex-row flex-wrap gap-y-sm')}>{children}</View>;
}
