import { Slot } from '@rn-primitives/slot';
import { createContext, useContext, type ComponentProps } from 'react';
import { Text as NativeText } from 'react-native';

import { cn } from '@/lib/class-names';

export const TextClassContext = createContext<string | undefined>(undefined);

type TextProps = ComponentProps<typeof NativeText> & { asChild?: boolean };

export function Text({ className, asChild = false, ...props }: TextProps) {
  const textClass = useContext(TextClassContext);
  const Component = asChild ? Slot : NativeText;
  return <Component className={cn('text-body text-text', textClass, className)} {...props} />;
}
