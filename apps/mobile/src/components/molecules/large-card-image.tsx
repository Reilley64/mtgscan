import { View } from 'react-native';

import { CardImage, type CardSheen } from '@/components/atoms/card-image';

type LargeCardImageProps = {
  uri: string | undefined;
  name: string;
  sheen?: CardSheen;
};

export function LargeCardImage({ uri, name, sheen }: LargeCardImageProps) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={name} className="w-[55%]">
      <CardImage uri={uri} sheen={sheen} />
    </View>
  );
}
