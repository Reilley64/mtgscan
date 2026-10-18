import type { CollectionQuery } from '@mtgscan/supabase/collection';
import type { BasicLandCard } from '@mtgscan/supabase/decks';

const fieldsThatBasicLandsMatch: string[] = ['text', 'names', 'sort', 'sort_order'] satisfies (keyof CollectionQuery)[];

export function matchingBasicLands(lands: BasicLandCard[], query: CollectionQuery) {
  if (Object.keys(query).some((field) => !fieldsThatBasicLandsMatch.includes(field))) {
    return [];
  }
  const words = [...(query.text?.split(/\s+/) ?? []), ...(query.names ?? [])].map((word) => word.trim().toLowerCase()).filter(Boolean);
  return lands.filter((land) => words.every((word) => land.name.toLowerCase().includes(word)));
}
