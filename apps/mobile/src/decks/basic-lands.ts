import type { BasicLandCount, DeckBasicLand } from '@mtgscan/supabase/decks';

export const basicLandCountLimit = 99;

type CatalogBasicLand = DeckBasicLand & { oracle_id: string };

export type BasicLandDraft = Record<string, number>;

export function catalogBasicLands(lands: DeckBasicLand[]) {
  return lands.filter((land): land is CatalogBasicLand => land.oracle_id !== null);
}

export function draftCount(land: CatalogBasicLand, draft: BasicLandDraft) {
  return draft[land.oracle_id] ?? land.count;
}

export function changedBasicLands(lands: DeckBasicLand[], draft: BasicLandDraft): BasicLandCount[] {
  return catalogBasicLands(lands)
    .filter((land) => draftCount(land, draft) !== land.count)
    .map((land) => ({ oracle_id: land.oracle_id, count: draftCount(land, draft) }));
}

export function basicLandTotal(lands: DeckBasicLand[]) {
  return lands.reduce((total, land) => total + land.count, 0);
}
