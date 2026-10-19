import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Switch } from '@/components/atoms/switch';
import { Text } from '@/components/atoms/text';

type SwitchRowProps = {
  title: string;
  meta?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
};

export function SwitchRow({ title, meta, value, disabled = false, onValueChange }: SwitchRowProps) {
  return (
    <Surface
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={meta}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className="flex-row items-center gap-md">
      <View className="flex-1 gap-xs">
        <Text variant="body-strong">{title}</Text>
        {meta ? <Text variant="meta">{meta}</Text> : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} disabled={disabled} />
      </View>
    </Surface>
  );
}
