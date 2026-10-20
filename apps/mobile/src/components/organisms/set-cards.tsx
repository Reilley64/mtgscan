import type { FinishView, SetCardPrinting, SetDetails } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { cardListRowClass } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { SheetSectionHeader } from '@/components/molecules/sheet-section';
import { copiesOf, inFinishView, shownCompletion, spokenSetCardPrinting } from '@/sets/set-completion';

export type SetCardsItem =
  | { kind: 'card'; key: string; printing: SetCardPrinting; finishView: FinishView }
  | { kind: 'variants'; key: string; count: string };

const itemSpacing = cva('', {
  variants: {
    kind: { card: 'pt-sm', variants: [cardListRowClass, 'pt-lg'] },
  },
});

function cardItems(printings: SetCardPrinting[], finishView: FinishView): SetCardsItem[] {
  return printings.map((printing) => ({ kind: 'card', key: printing.printing_id, printing, finishView }));
}

export function setCardsItems(set: SetDetails, finishView: FinishView): SetCardsItem[] {
  const variants = inFinishView(set.variants.card_printings, finishView);
  return [
    ...cardItems(inFinishView(set.main_set, finishView), finishView),
    ...(variants.length > 0
      ? [
          { kind: 'variants' as const, key: 'variants', count: shownCompletion(set.variants.completion[finishView]).count },
          ...cardItems(variants, finishView),
        ]
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

function itemContent(item: SetCardsItem) {
  switch (item.kind) {
    case 'card':
      return <SetCardTile printing={item.printing} finishView={item.finishView} />;
    case 'variants':
      return <SheetSectionHeader title="Variants" count={item.count} />;
  }
}

export function SetCardsItemView({ item }: { item: SetCardsItem }) {
  return <View className={itemSpacing({ kind: item.kind })}>{itemContent(item)}</View>;
}
