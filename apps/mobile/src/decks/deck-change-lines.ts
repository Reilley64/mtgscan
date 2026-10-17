import type { DeckChangeBasicLandLine, DeckChangeCopyLine, DeckChangeKind, DeckChangeLine, DeckRole } from '@mtgscan/supabase/decks';

export const deckChangeKindNames: Record<DeckChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  made_commander: 'Made commander',
  made_partner: 'Made partner',
  moved_to_main_deck: 'Moved to main deck',
  basic_lands: 'Basic lands',
  removed_from_collection: 'Removed from collection',
  revert: 'Revert',
  swapped_in: 'Swapped in',
  bought: 'Bought',
};

const placeNames: Record<DeckRole, string> = {
  commander: 'Commander',
  main: 'Main deck',
};

function copyLineOf(line: DeckChangeCopyLine) {
  const showsPlace = line.place_after === 'commander' || (line.place_before !== null && line.place_after !== null);
  return {
    key: line.copy_id,
    direction: line.place_after === null ? ('outgoing' as const) : ('incoming' as const),
    detail: showsPlace ? placeNames[line.place_after!] : line.type_line,
  };
}

function basicLandLineOf(line: DeckChangeBasicLandLine) {
  const change = line.count_after - line.count_before;
  return {
    key: line.oracle_id,
    direction: change < 0 ? ('outgoing' as const) : ('incoming' as const),
    detail: change < 0 ? `\u2212${-change}` : `+${change}`,
  };
}

export function changeLineOf(line: DeckChangeLine) {
  return {
    ...(line.kind === 'copy' ? copyLineOf(line) : basicLandLineOf(line)),
    name: line.name,
    uri: line.image_uris[0],
  };
}
