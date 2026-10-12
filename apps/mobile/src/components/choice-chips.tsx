import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, rounded, sizes, spacing, typography } from '@/theme';

type ChoiceChipsProps<Value extends string> = {
  values: readonly Value[];
  selected: Value;
  labelOf: (value: Value) => string;
  onSelect: (value: Value) => void;
};

export function ChoiceChips<Value extends string>({ values, selected, labelOf, onSelect }: ChoiceChipsProps<Value>) {
  return (
    <View style={styles.chips}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(value)}
            style={[styles.chip, isSelected && styles.selectedChip]}>
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>{labelOf(value)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    height: sizes.chip,
    paddingHorizontal: sizes.chipPadding,
    borderRadius: rounded.md,
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
  },
  selectedChip: {
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.chip,
    color: colors.text,
  },
  selectedLabel: {
    color: colors.onPrimary,
  },
});
