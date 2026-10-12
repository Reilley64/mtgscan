import * as TogglePrimitive from '@rn-primitives/toggle';
import type { ComponentProps } from 'react';

import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/class-names';

type ToggleProps = ComponentProps<typeof TogglePrimitive.Root>;

export function Toggle({ className, ...props }: ToggleProps) {
  return (
    <TextClassContext.Provider value={cn('text-body-strong', props.pressed ? 'text-on-primary' : 'text-text')}>
      <TogglePrimitive.Root
        className={cn(
          'h-button flex-row items-center justify-center rounded-sm px-md',
          props.pressed ? 'bg-primary' : 'bg-surface-control',
          props.disabled && 'opacity-50',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}
