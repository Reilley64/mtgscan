import { cva } from 'class-variance-authority';
import type { SymbolViewProps } from 'expo-symbols';

import { useOnGlass } from '@/components/atoms/glass-surface';
import { SymbolView } from '@/components/atoms/symbol-view';

const dimTints = cva('', {
  variants: {
    onGlass: {
      true: 'text-glass-text-dim',
      false: 'text-text-dim',
    },
  },
});

type DimSymbolProps = Pick<SymbolViewProps, 'name' | 'size'>;

export function DimSymbol({ name, size }: DimSymbolProps) {
  return <SymbolView name={name} size={size} className={dimTints({ onGlass: useOnGlass() })} />;
}
