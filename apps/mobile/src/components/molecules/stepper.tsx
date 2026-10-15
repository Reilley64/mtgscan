import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { SymbolView } from '@/components/atoms/symbol-view';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Button size="icon" accessibilityLabel={`Remove one ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)}>
        <SymbolView name="minus" size={sizes.iconButtonSymbol} className="text-text" />
      </Button>
      <Text variant="body-strong" accessibilityLabel={`${label}, ${value}`}>
        {value}
      </Text>
      <Button size="icon" accessibilityLabel={`Add one ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)}>
        <SymbolView name="plus" size={sizes.iconButtonSymbol} className="text-text" />
      </Button>
    </View>
  );
}
