import * as TogglePrimitive from '@rn-primitives/toggle';
import type { ComponentProps } from 'react';

import { buttonVariants, labelVariants } from '@/components/atoms/button';
import { choiceStates, verticalTouchSlop } from '@/components/atoms/control-style';
import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

type ToggleProps = Omit<ComponentProps<typeof TogglePrimitive.Root>, 'style' | 'hitSlop'>;

const toggleClass = cn(buttonVariants({ variant: 'secondary', size: 'default' }), choiceStates.checked.fill);

const toggleLabelClass = cn(labelVariants({ variant: 'secondary' }), choiceStates.checked.label);

export function Toggle({ className, ...props }: ToggleProps) {
  return (
    <TextClassContext value={toggleLabelClass}>
      <TogglePrimitive.Root hitSlop={verticalTouchSlop(sizes.button)} className={cn(toggleClass, className)} {...props} />
    </TextClassContext>
  );
}
