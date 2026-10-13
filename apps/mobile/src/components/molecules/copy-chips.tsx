import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { SetIcon } from '@/components/atoms/set-icon';

type CopyChipsProps = {
  setCode: string;
  setIconUri: string | undefined;
  collectorNumber: string;
  details: string[];
};

export function CopyChips({ setCode, setIconUri, collectorNumber, details }: CopyChipsProps) {
  return (
    <View className="flex-row flex-wrap justify-center gap-xs">
      <Chip label={setCode.toUpperCase()}>{setIconUri ? <SetIcon uri={setIconUri} /> : null}</Chip>
      {[collectorNumber, ...details].map((label) => (
        <Chip key={label} label={label} />
      ))}
    </View>
  );
}
