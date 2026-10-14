import { View } from 'react-native';

import { Chip } from '@/components/atoms/chip';

export type SingleChoiceProps<Value extends string> = {
  values: readonly Value[];
  selected: Value;
  labelOf: (value: Value) => string;
  onSelect: (value: Value) => void;
};

export type SelectableChip = { label: string; selected: boolean; onPress: () => void };

export function SelectableChips({ chips }: { chips: SelectableChip[] }) {
  return (
    <View className="flex-row flex-wrap gap-sm">
      {chips.map(({ label, selected, onPress }) => (
        <Chip key={label} label={label} selected={selected} onPress={onPress} />
      ))}
    </View>
  );
}

export function ChipGroup<Value extends string>({ values, selected, labelOf, onSelect }: SingleChoiceProps<Value>) {
  return (
    <SelectableChips
      chips={values.map((value) => ({ label: labelOf(value), selected: value === selected, onPress: () => onSelect(value) }))}
    />
  );
}
