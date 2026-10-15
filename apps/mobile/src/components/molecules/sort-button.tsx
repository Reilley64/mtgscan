import type { SFSymbol } from 'expo-symbols';

import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';
import type { SortDirection } from '@/lib/sort-order';

const directionSymbols: Record<SortDirection, SFSymbol> = { asc: 'arrow.up', desc: 'arrow.down' };

type SortButtonProps<Sort extends string> = {
  sorts: { sort: Sort; title: string }[];
  order: { sort: Sort; direction?: SortDirection };
  spokenOrder: string;
  active: boolean;
  onSelect: (sort: Sort) => void;
};

export function SortButton<Sort extends string>({ sorts, order, spokenOrder, active, onSelect }: SortButtonProps<Sort>) {
  return (
    <FloatingMenuButton
      symbol="arrow.up.arrow.down"
      active={active}
      accessibilityLabel={`Sort, ${spokenOrder}`}
      menuTitle="Sort by"
      choices={sorts.map(({ sort, title }) => ({
        title,
        checked: order.sort === sort,
        symbol: order.sort === sort && order.direction ? directionSymbols[order.direction] : undefined,
        onSelect: () => onSelect(sort),
      }))}
    />
  );
}
