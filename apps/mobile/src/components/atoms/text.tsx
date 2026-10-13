import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, use, type ComponentProps } from 'react';
import { Text as NativeText } from 'react-native';

import { cn } from '@/lib/class-names';

const textVariants = cva('', {
  variants: {
    variant: {
      'large-title': 'text-large-title text-text',
      'card-title': 'text-card-title text-text',
      'sign-in-title': 'text-sign-in-title text-text',
      brand: 'text-brand text-text',
      'sheet-title': 'text-sheet-title text-text',
      body: 'text-body text-text',
      'body-strong': 'text-body-strong text-text',
      meta: 'text-meta text-text-muted',
      price: 'text-price text-text-price',
      chip: 'text-chip text-text',
      credit: 'text-credit text-text-dim',
    },
  },
  defaultVariants: { variant: 'body' },
});

type TextVariant = NonNullable<VariantProps<typeof textVariants>['variant']>;

const titles: readonly TextVariant[] = ['large-title', 'card-title', 'sign-in-title', 'sheet-title'];

export const TextClassContext = createContext<string | undefined>(undefined);

type TextProps = ComponentProps<typeof NativeText> & { variant?: TextVariant };

export function Text({ className, variant = 'body', ...props }: TextProps) {
  const textClass = use(TextClassContext);
  return (
    <NativeText
      accessibilityRole={titles.includes(variant) ? 'header' : undefined}
      className={cn(textVariants({ variant }), textClass, className)}
      {...props}
    />
  );
}
