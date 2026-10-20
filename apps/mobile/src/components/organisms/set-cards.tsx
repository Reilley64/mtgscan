import type { FinishView, SetCardPrinting, SetDetails } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { CardGrid, inCardRows } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { SetSectionHeader } from '@/components/organisms/set-section-header';
import { copiesOf, inFinishView, shownCompletion, spokenSetCardPrinting, type ShownCompletion } from '@/sets/set-completion';

export type SetCardsRow =
  | { kind: 'cards'; key: string; printings: SetCardPrinting[]; finishView: FinishView }
  | { kind: 'section'; key: string; name: string; completion: ShownCompletion };

const rowSpacing = cva('', {
  variants: {
    kind: { cards: 'pt-sm', section: 'pt-lg' },
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

function sectionRows(key: string, name: string, section: SetDetails['other'], finishView: FinishView): SetCardsRow[] {
  const printings = inFinishView(section.card_printings, finishView);
  if (printings.length === 0) {
    return [];
  }
  return [
    { kind: 'section', key, name, completion: shownCompletion(section.completion[finishView]) },
    ...cardRows(key, printings, finishView),
  ];
}

export function setCardsRows(set: SetDetails, finishView: FinishView): SetCardsRow[] {
  if (set.sections.length === 0) {
    return cardRows('other', inFinishView(set.other.card_printings, finishView), finishView);
  }
  return [
    ...set.sections.flatMap((section, index) => sectionRows(`section ${index}`, section.name, section, finishView)),
    ...sectionRows('other', 'Other cards', set.other, finishView),
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
    case 'section':
      return <SetSectionHeader name={row.name} completion={row.completion} />;
  }
}

export function SetCardsRowView({ row }: { row: SetCardsRow }) {
  return <View className={rowSpacing({ kind: row.kind })}>{rowContent(row)}</View>;
}
