import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';

import { choiceClasses, verticalTouchSlop } from '@/components/atoms/control-style';
import { Text } from '@/components/atoms/text';
import type { SingleChoiceProps } from '@/components/molecules/chip-group';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

export function ToggleGroup<Value extends string>({ values, selected, labelOf, onSelect }: SingleChoiceProps<Value>) {
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
      className="flex-row rounded-sm bg-surface-control">
      {values.map((value) => {
        const { fill, label } = choiceClasses(value === selected);
        return (
          <ToggleGroupPrimitive.Item
            key={value}
            value={value}
            hitSlop={verticalTouchSlop(sizes.button)}
            className={cn('h-button flex-1 items-center justify-center rounded-sm px-md', fill)}>
            <Text variant="body-strong" className={label}>
              {labelOf(value)}
            </Text>
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
