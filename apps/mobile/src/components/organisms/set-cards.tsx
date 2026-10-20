import type { FinishView, SetCardPrinting, SetDetails, SetSection } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { CardTile } from '@/components/molecules/card-tile';
import { SetSectionHeader } from '@/components/organisms/set-section-header';
import { copiesOf, inFinishView, shownCompletion, spokenSetCardPrinting, type ShownCompletion } from '@/sets/set-completion';

export type SetCardsItem =
  | { kind: 'card-printing'; key: string; printing: SetCardPrinting; finishView: FinishView }
  | { kind: 'section'; key: string; name: string; completion: ShownCompletion };

const itemSpacing = cva('', {
  variants: {
    kind: { 'card-printing': 'pt-sm', section: 'pt-lg' },
  },
});

function printingItems(sectionKey: string, printings: SetCardPrinting[], finishView: FinishView): SetCardsItem[] {
  return printings.map((printing) => ({ kind: 'card-printing', key: `${sectionKey}:${printing.printing_id}`, printing, finishView }));
}

function sectionItems(key: string, section: SetSection, finishView: FinishView): SetCardsItem[] {
  const printings = inFinishView(section.card_printings, finishView);
  if (printings.length === 0) {
    return [];
  }
  return [
    { kind: 'section', key, name: section.name, completion: shownCompletion(section.completion[finishView]) },
    ...printingItems(key, printings, finishView),
  ];
}

export function setCardsItems(set: SetDetails, finishView: FinishView): SetCardsItem[] {
  if (set.sections.length === 0) {
    return printingItems('other', inFinishView(set.other.card_printings, finishView), finishView);
  }
  return [
    ...set.sections.flatMap((section, index) => sectionItems(`section ${index}`, section, finishView)),
    ...sectionItems('other', { name: 'Other cards', ...set.other }, finishView),
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
    case 'card-printing':
      return <SetCardTile printing={item.printing} finishView={item.finishView} />;
    case 'section':
      return <SetSectionHeader name={item.name} completion={item.completion} />;
  }
}

export function SetCardsItemView({ item }: { item: SetCardsItem }) {
  return <View className={itemSpacing({ kind: item.kind })}>{itemContent(item)}</View>;
}
