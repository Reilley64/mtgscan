import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

const rowClass = 'flex-row items-center gap-md p-sm';

type ListRowProps = {
  title: string;
  detail?: string;
  leading?: ReactNode;
  onPress?: () => void;
};

export function ListRow({ title, detail, leading, onPress }: ListRowProps) {
  const label = detail ? `${title}, ${detail}` : title;
  const content = (
    <>
      {leading}
      <View className="flex-1 gap-xs">
        <Text variant="body-strong" numberOfLines={1}>
          {title}
        </Text>
        {detail ? <Text variant="meta">{detail}</Text> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Surface accessibilityLabel={label} onPress={onPress} className={rowClass}>
        {content}
      </Surface>
    );
  }
  return (
    <Surface accessible accessibilityLabel={label} className={rowClass}>
      {content}
    </Surface>
  );
}
