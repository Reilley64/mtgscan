import type { ImportAdapter, StagedRow } from './import-run';
import {
  type BulkFile,
  type ScryfallCard,
  isCatalogLayout,
  isPaperPrinting,
  readBulkFiles,
  readCards,
} from './scryfall-bulk-data';

const priceColumns = {
  usd: 'usd_nonfoil_cents',
  usd_foil: 'usd_foil_cents',
  usd_etched: 'usd_etched_cents',
  eur: 'eur_nonfoil_cents',
  eur_foil: 'eur_foil_cents',
} as const;

type ScryfallPriceKey = keyof typeof priceColumns;

function priceInCents(card: ScryfallCard, key: ScryfallPriceKey): number | null {
  const amount = card.prices?.[key];
  if (amount === undefined || amount === null) {
    return null;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) {
    throw new Error(`Scryfall card ${card.id} has a ${key} price that is not a decimal amount: ${JSON.stringify(amount)}`);
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function priceRow(card: ScryfallCard): StagedRow | null {
  const row: Record<string, number | string | null> = { printing_id: card.id ?? null };
  let pricedFinishes = 0;
  for (const [key, column] of Object.entries(priceColumns) as [ScryfallPriceKey, string][]) {
    row[column] = priceInCents(card, key);
    pricedFinishes += row[column] === null ? 0 : 1;
  }
  return pricedFinishes > 0 ? { target: 'card_prices', row } : null;
}

async function* priceRows(defaultCards: BulkFile): AsyncGenerator<StagedRow> {
  for await (const card of readCards(defaultCards)) {
    const row = isCatalogLayout(card) && isPaperPrinting(card) ? priceRow(card) : null;
    if (row) {
      yield row;
    }
  }
}

export async function scryfallPrices(manifestLocation: string): Promise<ImportAdapter> {
  const { default_cards: defaultCards } = await readBulkFiles(manifestLocation, ['default_cards']);
  return {
    source: 'prices',
    sourceUpdatedAt: new Date(defaultCards.updated_at),
    rows: () => priceRows(defaultCards),
  };
}
