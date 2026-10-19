import type { PlannedBasicLandLine, PlannedCopyLine, PlannedSwap } from '@mtgscan/supabase/planned-swaps';

export const reason = 'Cheap removal that also answers an early threat.';

export function plannedCopyLine(copyId: string, name: string, changes: Partial<PlannedCopyLine> = {}): PlannedCopyLine {
  return {
    kind: 'copy',
    copy_id: copyId,
    name,
    image_uris: [`https://cards.scryfall.io/normal/front/${copyId}.jpg`],
    type_line: 'Instant',
    set: 'm10',
    collector_number: '146',
    finish: 'nonfoil',
    condition: 'near_mint',
    ...changes,
  };
}

export function plannedBasicLandLine(oracleId: string, name: string): PlannedBasicLandLine {
  return { kind: 'basic_land', oracle_id: oracleId, name, image_uris: [`https://cards.scryfall.io/normal/front/${oracleId}.jpg`] };
}

export function plannedSwapOf(plannedSwapId: string, changes: Partial<PlannedSwap> = {}): PlannedSwap {
  return {
    planned_swap_id: plannedSwapId,
    deck_id: 'deck-1',
    deck_name: 'Krenko',
    commander_art_crop_uri: 'https://cards.scryfall.io/art_crop/front/krenko.jpg',
    incoming: plannedCopyLine(`copy-${plannedSwapId}`, 'Lightning Bolt'),
    outgoing: null,
    as_commander: false,
    reason,
    status: 'open',
    close_note: null,
    created_at: new Date(2026, 9, 16, 18, 5).toISOString(),
    status_changed_at: new Date(2026, 9, 16, 18, 5).toISOString(),
    effect: null,
    ...changes,
  };
}
