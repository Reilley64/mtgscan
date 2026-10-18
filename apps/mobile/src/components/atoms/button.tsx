import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { verticalTouchSlop } from '@/components/atoms/control-style';
import { TextClassContext } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { colors, googleButtonColors, sizes } from '@/theme';

export const buttonVariants = cva('min-h-button flex-row items-center justify-center gap-sm disabled:opacity-dimmed aria-busy:opacity-100', {
  variants: {
    variant: {
      primary: 'bg-primary',
      secondary: 'bg-surface-control',
      danger: 'bg-danger-tint',
      google: 'border border-button-google-border bg-button-google',
    },
    size: {
      default: 'min-w-touch-target rounded-sm px-md',
      icon: 'h-button w-button rounded-full',
      'sign-in': 'h-sign-in-button rounded-sm px-md',
    },
  },
});

export const labelVariants = cva('text-body-strong', {
  variants: {
    variant: {
      primary: 'text-on-primary',
      secondary: 'text-text',
      danger: 'text-danger',
      google: 'text-button-google-text',
    },
    size: {
      default: '',
      icon: '',
      'sign-in': 'text-sign-in-button',
    },
  },
  compoundVariants: [{ variant: 'google', size: 'sign-in', className: 'text-google-button' }],
});

const spinnerColors = {
  primary: colors.onPrimary,
  secondary: colors.text,
  danger: colors.danger,
  google: googleButtonColors.text,
} as const;

const verticalSlop = verticalTouchSlop(sizes.button);

const hitSlops = {
  default: verticalSlop,
  icon: { ...verticalSlop, left: verticalSlop.top, right: verticalSlop.top },
  'sign-in': undefined,
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
    <TextClassContext value={labelVariants({ variant, size })}>
      <Pressable
        accessibilityRole="button"
        aria-busy={busy}
        disabled={disabled || busy}
        hitSlop={hitSlops[size]}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}>
        {busy ? <ActivityIndicator color={spinnerColors[variant]} /> : null}
        {children}
      </Pressable>
    </TextClassContext>
  );
}
