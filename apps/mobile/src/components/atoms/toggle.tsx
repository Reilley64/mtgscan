import * as TogglePrimitive from '@rn-primitives/toggle';
import type { ComponentProps } from 'react';

import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

const extraTouch = (sizes.touchTarget - sizes.button) / 2;

type ToggleProps = Omit<ComponentProps<typeof TogglePrimitive.Root>, 'style' | 'hitSlop'>;

export function Toggle({ className, pressed, disabled, ...props }: ToggleProps) {
  return (
    <TextClassContext value={cn('text-body-strong', pressed ? 'text-on-primary' : 'text-text')}>
      <TogglePrimitive.Root
        pressed={pressed}
        disabled={disabled}
        hitSlop={{ top: extraTouch, bottom: extraTouch }}
        className={cn(
          'h-button min-w-touch-target flex-row items-center justify-center gap-sm rounded-sm px-md',
          pressed ? 'bg-primary' : 'bg-surface-control',
          disabled && 'opacity-dimmed',
          className,
        )}
        {...props}
      />
    </TextClassContext>
  );
}
