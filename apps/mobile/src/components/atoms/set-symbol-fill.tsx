import { View } from 'react-native';

import { TintedImage } from '@/components/atoms/tinted-image';

type SetSymbolFillProps = {
  uri: string;
  share: number;
};

export function SetSymbolFill({ uri, share }: SetSymbolFillProps) {
  return (
    <View className="size-set-symbol-fill">
      <TintedImage source={uri} className="absolute inset-0 text-line" contentFit="contain" cachePolicy="disk" />
      <View className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: `${share * 100}%` }}>
        <TintedImage
          source={uri}
          className="absolute bottom-0 left-0 size-set-symbol-fill text-primary"
          contentFit="contain"
          cachePolicy="disk"
        />
      </View>
    </View>
  );
}
