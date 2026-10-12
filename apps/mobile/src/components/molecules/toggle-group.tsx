import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';

import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

const extraTouch = (sizes.touchTarget - sizes.button) / 2;

type ToggleGroupProps<Value extends string> = {
  accessibilityLabel: string;
  values: readonly Value[];
  selected: Value;
  labelOf: (value: Value) => string;
  onSelect: (value: Value) => void;
};

export function ToggleGroup<Value extends string>({
  accessibilityLabel,
  values,
  selected,
  labelOf,
  onSelect,
}: ToggleGroupProps<Value>) {
  const select = (chosen: string | undefined) => {
    const value = values.find((candidate) => candidate === chosen);
    if (value) {
      onSelect(value);
    }
  };

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={selected}
      onValueChange={select}
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-sm bg-surface-control">
      {values.map((value) => {
        const checked = value === selected;
        return (
          <ToggleGroupPrimitive.Item
            key={value}
            value={value}
            hitSlop={{ top: extraTouch, bottom: extraTouch }}
            className={cn('h-button flex-1 items-center justify-center rounded-sm px-md', checked && 'bg-primary')}>
            <Text variant="body-strong" className={checked ? 'text-on-primary' : 'text-text'}>
              {labelOf(value)}
            </Text>
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
