import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { colors, sizes } from '@/theme';

const buttonVariants = cva('h-button flex-row items-center justify-center gap-sm', {
  variants: {
    variant: {
      primary: 'bg-primary',
      secondary: 'bg-surface-control',
      danger: 'bg-danger-tint',
    },
    size: {
      default: 'min-w-touch-target rounded-sm px-md',
      icon: 'w-button rounded-full',
    },
  },
});

const labelVariants = cva('text-body-strong', {
  variants: {
    variant: {
      primary: 'text-on-primary',
      secondary: 'text-text',
      danger: 'text-danger',
    },
  },
});

const spinnerColors = {
  primary: colors.onPrimary,
  secondary: colors.text,
  danger: colors.danger,
} as const;

const extraTouch = (sizes.touchTarget - sizes.button) / 2;

const hitSlops = {
  default: { top: extraTouch, bottom: extraTouch },
  icon: extraTouch,
} as const;

type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonProps = Omit<ComponentProps<typeof Pressable>, 'style' | 'hitSlop' | 'children'> & {
  children?: ReactNode;
  variant?: NonNullable<ButtonVariants['variant']>;
  size?: NonNullable<ButtonVariants['size']>;
  busy?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'default',
  busy = false,
  disabled = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <TextClassContext value={labelVariants({ variant })}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || busy, busy }}
        disabled={disabled || busy}
        hitSlop={hitSlops[size]}
        className={cn(buttonVariants({ variant, size }), disabled && 'opacity-dimmed', className)}
        {...props}>
        {busy ? <ActivityIndicator color={spinnerColors[variant]} /> : null}
        {children}
      </Pressable>
    </TextClassContext>
  );
}
