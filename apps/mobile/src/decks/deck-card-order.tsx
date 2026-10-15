import { createContext, use, useState, type ReactNode } from 'react';

import { defaultDeckGrouping, defaultDeckOrder, type DeckGrouping, type DeckOrder } from '@/decks/deck-groups';

type DeckCardOrder = {
  grouping: DeckGrouping;
  order: DeckOrder;
  setGrouping: (grouping: DeckGrouping) => void;
  setOrder: (order: DeckOrder) => void;
};

const DeckCardOrderContext = createContext<DeckCardOrder | null>(null);

export function DeckCardOrderProvider({ children }: { children: ReactNode }) {
  const [grouping, setGrouping] = useState(defaultDeckGrouping);
  const [order, setOrder] = useState(defaultDeckOrder);
  return <DeckCardOrderContext value={{ grouping, order, setGrouping, setOrder }}>{children}</DeckCardOrderContext>;
}

export function useDeckCardOrder() {
  const deckCardOrder = use(DeckCardOrderContext);
  if (!deckCardOrder) {
    throw new Error('useDeckCardOrder needs a DeckCardOrderProvider');
  }
  return deckCardOrder;
}
