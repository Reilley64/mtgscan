import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';

export type SingleChoiceProps<Value extends string> = {
  values: readonly Value[];
  selected: Value;
  labelOf: (value: Value) => string;
  onSelect: (value: Value) => void;
};

export function ChipGroup<Value extends string>({ values, selected, labelOf, onSelect }: SingleChoiceProps<Value>) {
  return (
    <View className="flex-row flex-wrap gap-sm">
      {values.map((value) => (
        <Chip key={value} label={labelOf(value)} selected={value === selected} onPress={() => onSelect(value)} />
      ))}
    </View>
  );
}
