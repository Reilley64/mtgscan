import type { ImportClient } from '../import/import-run';
import {
  type ScryfallCard,
  isCatalogLayout,
  isPaperPrinting,
  readBulkFiles,
  readCards,
} from '../import/scryfall-bulk-data';
import type { PrintingListRow } from './manifest';

const layoutsOutsideTheGallery = new Set(['front_card']);

export type GalleryPrinting = {
  printing: PrintingListRow;
  image: string;
  releasedAt: string;
};

export type GalleryPrintings = {
  printings: GalleryPrinting[];
  scryfallSnapshot: string;
  cardCatalogSnapshot: string;
  notInCardCatalog: string[];
};

async function cardCatalogPrintings(client: ImportClient): Promise<Map<string, boolean>> {
  const basicLandById = new Map<string, boolean>();
  let after: string | undefined;
  for (;;) {
    const { data, error } = await client.rpc('list_gallery_printings', after ? { after_id: after } : {});
    if (error) {
      throw new Error(`Could not read the card catalog: ${error.message}`);
    }
    for (const row of data) {
      basicLandById.set(row.id, row.basic_land);
    }
    if (data.length === 0) {
      return basicLandById;
    }
    after = data.at(-1)!.id;
  }
}

async function cardCatalogSnapshot(client: ImportClient): Promise<string> {
  const { data, error } = await client.from('import_snapshots').select('snapshot_at').eq('source', 'catalog').maybeSingle();
  if (error || !data) {
    throw new Error(`The card catalog has no import snapshot. Run the catalog import first. ${error?.message ?? ''}`.trim());
  }
  return data.snapshot_at;
}

export function normalImage(card: ScryfallCard): string | undefined {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
}

function galleryPrinting(card: ScryfallCard, basicLand: boolean): GalleryPrinting | null {
  const faces = card.card_faces ?? [];
  const image = normalImage(card);
  const oracleId = card.oracle_id ?? faces[0]?.oracle_id;
  if (!image || !oracleId || !card.id || !card.name || !card.set || !card.collector_number || !card.released_at) {
    return null;
  }
  return {
    printing: {
      id: card.id,
      oracleId,
      illustrationId: card.illustration_id ?? faces[0]?.illustration_id ?? null,
      name: card.name,
      faceNames: faces.length > 1 ? faces.map((face) => face.name ?? '') : [],
      set: card.set,
      collectorNumber: card.collector_number,
      frame: card.frame ?? '',
      finishes: card.finishes ?? [],
      basicLand,
    },
    image,
    releasedAt: card.released_at,
  };
}

function releaseOrder(a: GalleryPrinting, b: GalleryPrinting): number {
  return (
    a.releasedAt.localeCompare(b.releasedAt) ||
    a.printing.set.localeCompare(b.printing.set) ||
    a.printing.collectorNumber.localeCompare(b.printing.collectorNumber, 'en', { numeric: true }) ||
    a.printing.id.localeCompare(b.printing.id)
  );
}

export async function galleryPrintings(client: ImportClient, manifestLocation: string): Promise<GalleryPrintings> {
  const [{ default_cards: defaultCards }, basicLandById, catalogSnapshot] = await Promise.all([
    readBulkFiles(manifestLocation, ['default_cards']),
    cardCatalogPrintings(client),
    cardCatalogSnapshot(client),
  ]);
  const printings: GalleryPrinting[] = [];
  const notInCardCatalog: string[] = [];
  for await (const card of readCards(defaultCards)) {
    if (!isCatalogLayout(card) || !isPaperPrinting(card) || layoutsOutsideTheGallery.has(card.layout ?? '')) {
      continue;
    }
    const basicLand = card.id === undefined ? undefined : basicLandById.get(card.id);
    if (basicLand === undefined) {
      notInCardCatalog.push(`${card.name} (${card.set} ${card.collector_number})`);
      continue;
    }
    const printing = galleryPrinting(card, basicLand);
    if (printing) {
      printings.push(printing);
    }
  }
  return {
    printings: printings.sort(releaseOrder),
    scryfallSnapshot: defaultCards.updated_at,
    cardCatalogSnapshot: catalogSnapshot,
    notInCardCatalog,
  };
}
