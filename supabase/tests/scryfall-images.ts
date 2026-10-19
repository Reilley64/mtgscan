export function artCrop(printingId: string, version: number) {
  return `https://cards.scryfall.io/art_crop/front/${printingId[0]}/${printingId[1]}/${printingId}.jpg?${version}`;
}
