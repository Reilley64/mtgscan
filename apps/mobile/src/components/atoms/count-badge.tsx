import { View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';

type CountBadgeProps = {
  count: number | '∞';
  className?: string;
};

export function CountBadge({ count, className }: CountBadgeProps) {
  return (
    <View
      className={cn('h-count-badge min-w-count-badge items-center justify-center rounded-full bg-badge px-xs', className)}>
      <Text variant="chip">{count}</Text>
    </View>
  );
}
