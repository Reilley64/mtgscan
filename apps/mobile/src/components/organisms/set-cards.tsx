import type { FinishView, SetCardPrinting, SetDetails } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { CardGrid, inCardRows } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { SheetSectionHeader } from '@/components/molecules/sheet-section';
import { copiesOf, inFinishView, spokenSetCardPrinting } from '@/sets/set-completion';

export type SetCardsRow =
  | { kind: 'cards'; key: string; printings: SetCardPrinting[]; finishView: FinishView }
  | { kind: 'variants'; key: string; owned: number; size: number };

const rowSpacing = cva('', {
  variants: {
    kind: { cards: 'pt-sm', variants: 'pt-lg' },
  },
});

function cardRows(section: string, printings: SetCardPrinting[], finishView: FinishView): SetCardsRow[] {
  return inCardRows(printings).map((rowPrintings, row) => ({
    kind: 'cards',
    key: `${section}:${row}`,
    printings: rowPrintings,
    finishView,
  }));
}

export function setCardsRows(set: SetDetails, finishView: FinishView): SetCardsRow[] {
  const variants = inFinishView(set.variants.card_printings, finishView);
  return [
    ...cardRows('main set', inFinishView(set.main_set, finishView), finishView),
    ...(variants.length > 0
      ? [{ kind: 'variants' as const, key: 'variants', ...set.variants.completion[finishView] }, ...cardRows('variants', variants, finishView)]
      : []),
  ];
}

function SetCardTile({ printing, finishView }: { printing: SetCardPrinting; finishView: FinishView }) {
  const copies = copiesOf(printing, finishView);
  return (
    <CardTile
      uri={printing.image_uri ?? undefined}
      accessibilityLabel={spokenSetCardPrinting(printing, finishView)}
      quantity={copies >= 2 ? copies : undefined}
      dimmed={copies === 0}
      sheen={finishView === 'foil' && copies > 0 ? 'foil' : undefined}
    />
  );
}

function rowContent(row: SetCardsRow) {
  switch (row.kind) {
    case 'cards':
      return (
        <CardGrid>
          {row.printings.map((printing) => (
            <SetCardTile key={printing.printing_id} printing={printing} finishView={row.finishView} />
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
