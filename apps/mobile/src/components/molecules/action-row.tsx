import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type ActionRowProps = {
  title: string;
  badge?: { content: ReactNode; spoken: string };
  detail: string;
  action: { label: string; variant?: 'secondary' | 'danger'; busy?: boolean; onPress: () => void };
};

export function ActionRow({ title, badge, detail, action }: ActionRowProps) {
  return (
    <View className="flex-row items-center gap-md">
      <View accessible accessibilityLabel={[title, badge?.spoken, detail].filter(Boolean).join(', ')} className="flex-1 gap-xs">
        <View className="flex-row items-center gap-sm">
          <Text variant="body-strong" numberOfLines={1} className="shrink">
            {title}
          </Text>
          {badge?.content}
        </View>
        <Text variant="meta">{detail}</Text>
      </View>
      <Button variant={action.variant} busy={action.busy} onPress={action.onPress}>
        <Text>{action.label}</Text>
      </Button>
    </View>
  );
}
