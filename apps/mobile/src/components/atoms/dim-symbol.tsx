import { cva } from 'class-variance-authority';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { cssInterop } from 'nativewind';

import { useOnGlass } from '@/components/atoms/glass-surface';

cssInterop(SymbolView, { className: { target: 'style', nativeStyleToProp: { color: 'tintColor' } } });

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
