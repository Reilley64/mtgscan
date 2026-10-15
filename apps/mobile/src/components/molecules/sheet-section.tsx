import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

type SheetSectionProps = {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
};

function SectionHeader({ title, count }: Pick<SheetSectionProps, 'title' | 'count'>) {
  return count === undefined ? (
    <Text variant="body-strong" accessibilityRole="header" className="text-primary">
      {title}
    </Text>
  ) : (
    <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${count}`} className="flex-row items-baseline gap-sm">
      <Text variant="body-strong" className="text-primary">
        {title}
      </Text>
      <Text variant="meta">{count}</Text>
    </View>
  );
}

export function SheetSection({ title, count, action, children }: SheetSectionProps) {
  return (
    <View className="gap-sm">
      {action ? (
        <View className="flex-row items-center justify-between">
          <SectionHeader title={title} count={count} />
          {action}
        </View>
      ) : (
        <SectionHeader title={title} count={count} />
      )}
      {children}
    </View>
  );
}
