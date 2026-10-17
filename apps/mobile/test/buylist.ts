import type { BuylistCard, FreeCopy, PlannedCardLine } from '@mtgscan/supabase/buylist';

import { reason } from './planned-swaps';

export function plannedCardLine(oracleId: string, name: string, changes: Partial<PlannedCardLine> = {}): PlannedCardLine {
  return {
    kind: 'card',
    oracle_id: oracleId,
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${oracleId}.jpg`],
    type_line: 'Instant',
    ...changes,
  };
}

export function buylistCardOf(buylistCardId: string, changes: Partial<BuylistCard> = {}): BuylistCard {
  return {
    buylist_card_id: buylistCardId,
    deck_id: 'deck-1',
    deck_name: 'Krenko',
    commander_art_crop_uri: 'https://cards.scryfall.io/art_crop/front/krenko.jpg',
    incoming: plannedCardLine('oracle-counterspell', 'Counterspell'),
    outgoing: null,
    as_commander: false,
    reason,
    status: 'open',
    close_note: null,
    client_name: 'ChatGPT',
    created_at: new Date(2026, 9, 16, 18, 5).toISOString(),
    status_changed_at: new Date(2026, 9, 16, 18, 5).toISOString(),
    effect: null,
    ...changes,
  };
}

export function freeCopyOf(copyId: string, changes: Partial<FreeCopy> = {}): FreeCopy {
  return {
    copy_id: copyId,
    printing_id: `printing-${copyId}`,
    name: 'Counterspell',
    set: 'lea',
    collector_number: '54',
    rarity: 'uncommon',
    image_uris: [`https://cards.scryfall.io/normal/front/${copyId}.jpg`],
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    protected: false,
    price: null,
    ...changes,
  };
}
