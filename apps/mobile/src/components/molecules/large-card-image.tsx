import { useState } from 'react';
import { View } from 'react-native';

import { CardImage, type CardSheen } from '@/components/atoms/card-image';
import { printedCardCornerPerWidth } from '@/theme';

type LargeCardImageProps = {
  uri: string | undefined;
  name: string;
  sheen?: CardSheen;
};

export function LargeCardImage({ uri, name, sheen }: LargeCardImageProps) {
  const [width, setWidth] = useState(0);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className="w-[55%] overflow-hidden"
      style={{ borderRadius: width * printedCardCornerPerWidth }}>
      <CardImage uri={uri} sheen={sheen} />
    </View>
  );
}
