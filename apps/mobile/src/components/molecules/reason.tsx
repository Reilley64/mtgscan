import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

type ReasonProps = {
  reason: string;
  meta?: string;
};

export function Reason({ reason, meta }: ReasonProps) {
  return (
    <View className="gap-xs">
      <Text>{reason}</Text>
      {meta ? <Text variant="meta">{meta}</Text> : null}
    </View>
  );
}
