import type { SetCardPrinting, SetDetails } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { CardGrid, inCardRows } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { SheetSectionHeader } from '@/components/molecules/sheet-section';
import { copiesOf, spokenSetCardPrinting } from '@/sets/set-completion';

export type SetCardsRow =
  | { kind: 'cards'; key: string; printings: SetCardPrinting[] }
  | { kind: 'variants'; key: string; owned: number; size: number };

const rowSpacing = cva('', {
  variants: {
    kind: { cards: 'pt-sm', variants: 'pt-lg' },
  },
});

function cardRows(section: string, printings: SetCardPrinting[]): SetCardsRow[] {
  return inCardRows(printings).map((rowPrintings, row) => ({ kind: 'cards', key: `${section}:${row}`, printings: rowPrintings }));
}

export function setCardsRows(set: SetDetails): SetCardsRow[] {
  const { completion, card_printings } = set.variants;
  return [
    ...cardRows('main set', set.main_set),
    ...(card_printings.length > 0
      ? [{ kind: 'variants' as const, key: 'variants', ...completion.any }, ...cardRows('variants', card_printings)]
      : []),
  ];
}

function SetCardTile({ printing }: { printing: SetCardPrinting }) {
  const copies = copiesOf(printing);
  return (
    <CardTile
      uri={printing.image_uri ?? undefined}
      accessibilityLabel={spokenSetCardPrinting(printing)}
      quantity={copies >= 2 ? copies : undefined}
      dimmed={copies === 0}
    />
  );
}

function rowContent(row: SetCardsRow) {
  switch (row.kind) {
    case 'cards':
      return (
        <CardGrid>
          {row.printings.map((printing) => (
            <SetCardTile key={printing.printing_id} printing={printing} />
          ))}
        </CardGrid>
      );
    case 'variants':
      return <SheetSectionHeader title="Variants" count={`${row.owned} of ${row.size}`} />;
  }
}

export function SetCardsRowView({ row }: { row: SetCardsRow }) {
  return <View className={rowSpacing({ kind: row.kind })}>{rowContent(row)}</View>;
}
