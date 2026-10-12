import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Switch } from '@/components/atoms/switch';
import { Text } from '@/components/atoms/text';

type SwitchRowProps = {
  title: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function SwitchRow({ title, value, onValueChange }: SwitchRowProps) {
  return (
    <Surface
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      className="flex-row items-center gap-md">
      <Text variant="body-strong" className="flex-1">
        {title}
      </Text>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} />
      </View>
    </Surface>
  );
}
