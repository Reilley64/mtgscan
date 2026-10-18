import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';

import { choiceStates, verticalTouchSlop } from '@/components/atoms/control-style';
import { CountBadge } from '@/components/atoms/count-badge';
import { Text } from '@/components/atoms/text';
import type { SingleChoiceProps } from '@/components/molecules/chip-group';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

type ToggleGroupProps<Value extends string> = SingleChoiceProps<Value> & {
  countOf?: (value: Value) => number;
};

export function ToggleGroup<Value extends string>({ values, selected, labelOf, countOf, onSelect }: ToggleGroupProps<Value>) {
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
        const count = countOf?.(value) ?? 0;
        return (
          <ToggleGroupPrimitive.Item
            key={value}
            value={value}
            accessibilityLabel={count > 0 ? `${labelOf(value)}, ${count}` : undefined}
            hitSlop={verticalTouchSlop(sizes.button)}
            className={cn('min-h-button flex-1 flex-row items-center justify-center gap-xs rounded-sm px-md', choiceStates.checked.fill)}>
            <Text variant="body-strong" numberOfLines={1} adjustsFontSizeToFit className={choiceStates.checked.label}>
              {labelOf(value)}
            </Text>
            {count > 0 ? <CountBadge count={count} /> : null}
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
