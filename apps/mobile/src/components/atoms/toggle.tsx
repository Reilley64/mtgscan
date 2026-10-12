import * as TogglePrimitive from '@rn-primitives/toggle';
import type { ComponentProps } from 'react';

import { buttonVariants, labelVariants } from '@/components/atoms/button';
import { verticalTouchSlop } from '@/components/atoms/control-style';
import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

type ToggleProps = Omit<ComponentProps<typeof TogglePrimitive.Root>, 'style' | 'hitSlop'>;

export function Toggle({ className, pressed, disabled, ...props }: ToggleProps) {
  const variant = pressed ? 'primary' : 'secondary';
  return (
    <TextClassContext value={labelVariants({ variant })}>
      <TogglePrimitive.Root
        pressed={pressed}
        disabled={disabled}
        hitSlop={verticalTouchSlop(sizes.button)}
        className={cn(buttonVariants({ variant, size: 'default' }), disabled && 'opacity-dimmed', className)}
        {...props}
      />
    </TextClassContext>
  );
}
