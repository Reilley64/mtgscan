import type { ComponentProps } from 'react';
import { TextInput } from 'react-native';

import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

type InputProps = Omit<ComponentProps<typeof TextInput>, 'style' | 'placeholderTextColor'>;

export function Input({ className, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textDim}
      className={cn('h-button rounded-sm bg-surface-control px-md text-field text-text', className)}
      {...props}
    />
  );
}
