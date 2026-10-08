import type { Printing } from "./batch";

const API = "https://api.scryfall.com";
const HEADERS = { Accept: "application/json" };

export function cardImageUrl(
  scryfallId: string,
  version: "small" | "normal" = "small",
): string {
  return `https://cards.scryfall.io/${version}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}

export async function autocompleteNames(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const response = await fetch(
    `${API}/cards/autocomplete?q=${encodeURIComponent(query.trim())}`,
    { headers: HEADERS },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: string[] };
  return body.data ?? [];
}

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  card_faces?: { oracle_id?: string }[];
};

export async function paperPrintings(name: string): Promise<Printing[]> {
  const query = `!"${name}" unique:prints game:paper`;
  const response = await fetch(
    `${API}/cards/search?order=released&q=${encodeURIComponent(query)}`,
    { headers: HEADERS },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: ScryfallCard[] };
  return (body.data ?? []).map((card) => ({
    scryfallId: card.id,
    oracleId: card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? "",
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
  }));
}
