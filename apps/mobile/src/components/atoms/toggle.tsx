import * as TogglePrimitive from '@rn-primitives/toggle';
import type { ComponentProps } from 'react';

import { buttonVariants, labelVariants } from '@/components/atoms/button';
import { verticalTouchSlop } from '@/components/atoms/control-style';
import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

type ToggleProps = Omit<ComponentProps<typeof TogglePrimitive.Root>, 'style' | 'hitSlop'>;

const toggleClass = cn(buttonVariants({ variant: 'secondary', size: 'default' }), 'group aria-checked:bg-primary');

const toggleLabelClass = cn(labelVariants({ variant: 'secondary' }), 'group-aria-checked:text-on-primary');

export function Toggle({ className, ...props }: ToggleProps) {
  return (
    <TextClassContext value={toggleLabelClass}>
      <TogglePrimitive.Root hitSlop={verticalTouchSlop(sizes.button)} className={cn(toggleClass, className)} {...props} />
    </TextClassContext>
  );
}
