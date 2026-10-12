import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';

import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/class-names';

const buttonVariants = cva('h-button flex-row items-center justify-center rounded-sm px-md', {
  variants: {
    variant: {
      primary: 'bg-primary active:opacity-80',
      secondary: 'bg-surface-control active:opacity-80',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

const buttonTextVariants = cva('text-body-strong', {
  variants: {
    variant: {
      primary: 'text-on-primary',
      secondary: 'text-text',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

type ButtonProps = ComponentProps<typeof Pressable> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <Pressable
        accessibilityRole="button"
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}
