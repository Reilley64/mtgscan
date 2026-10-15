import type { BasicLandCount, DeckBasicLand } from '@mtgscan/supabase/decks';

export const basicLandCountLimit = 99;

type CatalogBasicLand = DeckBasicLand & { oracle_id: string };

export type BasicLandDraft = Record<string, number>;

export function catalogBasicLands(lands: DeckBasicLand[]) {
  return lands.filter((land): land is CatalogBasicLand => land.oracle_id !== null);
}

export function basicLandDraftOf(lands: DeckBasicLand[]): BasicLandDraft {
  return Object.fromEntries(catalogBasicLands(lands).map((land) => [land.oracle_id, land.count]));
}

export function changedBasicLands(lands: DeckBasicLand[], draft: BasicLandDraft): BasicLandCount[] {
  return catalogBasicLands(lands)
    .filter((land) => draft[land.oracle_id] !== land.count)
    .map((land) => ({ oracle_id: land.oracle_id, count: draft[land.oracle_id]! }));
}

export function basicLandTotal(lands: DeckBasicLand[]) {
  return lands.reduce((total, land) => total + land.count, 0);
}
