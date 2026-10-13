import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { SetIcon } from '@/components/atoms/set-icon';
import { Text } from '@/components/atoms/text';

type CopyMetaProps = {
  setCode: string;
  rarity: ComponentProps<typeof SetIcon>['rarity'];
  setIconUri: string | undefined;
  collectorNumber: string;
  condition?: string;
};

export function CopyMeta({ setCode, rarity, setIconUri, collectorNumber, condition }: CopyMetaProps) {
  const setLabel = setCode.toUpperCase();
  return (
    <View className="flex-row items-center justify-center gap-xs">
      {setIconUri ? (
        <View accessible accessibilityLabel={setLabel}>
          <SetIcon uri={setIconUri} rarity={rarity} />
        </View>
      ) : (
        <Text variant="meta">{setLabel}</Text>
      )}
      <Text variant="meta">{collectorNumber}</Text>
      {condition && (
        <>
          <Text variant="meta" className="text-text-dim">
            ·
          </Text>
          <Text variant="meta">{condition}</Text>
        </>
      )}
    </View>
  );
}
