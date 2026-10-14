import type { CardCondition, CardLanguage, ScanBatchStack } from '@mtgscan/supabase/collection';
import type { Finish } from '@mtgscan/supabase/search';

import type { GalleryCardPrinting } from '../../modules/card-recognizer';

export type Printing = GalleryCardPrinting;

export type BatchScan = Readonly<{
  scanId: string;
  options: readonly Printing[];
  sameTextTwinCount: number;
  premiumMark: boolean;
  printing: Printing;
  finish: Finish;
  condition: CardCondition;
  language: CardLanguage;
}>;

export type ScanBatch = Readonly<{
  scans: readonly BatchScan[];
  commitPending: boolean;
}>;

export type ScanBatchAction =
  | {
      type: 'recognized';
      scanId: string;
      printing: Printing;
      options: readonly Printing[];
      sameTextTwinCount: number;
      premiumMark: boolean;
    }
  | { type: 'choose'; scanId: string; printing: Printing }
  | { type: 'setFinish'; scanId: string; finish: Finish }
  | { type: 'setCondition'; scanId: string; condition: CardCondition }
  | { type: 'setLanguage'; scanId: string; language: CardLanguage }
  | { type: 'addCopy'; scanId: string; newScanId: string }
  | { type: 'remove'; scanId: string }
  | { type: 'commitStarted' }
  | { type: 'committed'; scanIds: readonly string[] };

export type ScanEdit = Exclude<ScanBatchAction, { type: 'recognized' | 'commitStarted' | 'committed' }>;

export const newScanDefaults = { condition: 'near_mint', language: 'en' } as const satisfies Pick<BatchScan, 'condition' | 'language'>;

export const emptyScanBatch: ScanBatch = {
  scans: [],
  commitPending: false,
};

const premiumFinishes: readonly Finish[] = ['foil', 'etched'];

function defaultFinish(printing: Printing, premiumMark: boolean): Finish {
  if (premiumMark && printing.finishes.includes('foil')) {
    return 'foil';
  }
  if (printing.finishes.includes('nonfoil')) {
    return 'nonfoil';
  }
  return premiumFinishes.find((finish) => printing.finishes.includes(finish)) ?? 'nonfoil';
}

function finishAfterSwitch(scan: BatchScan, printing: Printing): Finish {
  return printing.finishes.includes(scan.finish) ? scan.finish : defaultFinish(printing, scan.premiumMark);
}

function updateScan(batch: ScanBatch, scanId: string, change: (scan: BatchScan) => BatchScan): ScanBatch {
  return { ...batch, scans: batch.scans.map((scan) => (scan.scanId === scanId ? change(scan) : scan)) };
}

export function scanBatchReducer(batch: ScanBatch, action: ScanBatchAction): ScanBatch {
  switch (action.type) {
    case 'recognized': {
      if (batch.scans.some((existing) => existing.scanId === action.scanId)) {
        return batch;
      }
      const { type, ...scan } = action;
      return {
        ...batch,
        scans: [...batch.scans, { ...scan, finish: defaultFinish(scan.printing, scan.premiumMark), ...newScanDefaults }],
      };
    }
    case 'choose':
      return updateScan(batch, action.scanId, (scan) => ({
        ...scan,
        printing: action.printing,
        finish: finishAfterSwitch(scan, action.printing),
      }));
    case 'setFinish':
      return updateScan(batch, action.scanId, (scan) => ({ ...scan, finish: action.finish }));
    case 'setCondition':
      return updateScan(batch, action.scanId, (scan) => ({ ...scan, condition: action.condition }));
    case 'setLanguage':
      return updateScan(batch, action.scanId, (scan) => ({ ...scan, language: action.language }));
    case 'addCopy': {
      const copied = batch.scans.find((scan) => scan.scanId === action.scanId);
      return copied ? { ...batch, scans: [...batch.scans, { ...copied, scanId: action.newScanId }] } : batch;
    }
    case 'remove':
      return { ...batch, scans: batch.scans.filter((scan) => scan.scanId !== action.scanId) };
    case 'commitStarted':
      return { ...batch, commitPending: true };
    case 'committed':
      return {
        ...batch,
        scans: batch.scans.filter((scan) => !action.scanIds.includes(scan.scanId)),
        commitPending: false,
      };
  }
}

export function stacksOf(scans: readonly BatchScan[]): ScanBatchStack[] {
  const stacks = new Map<string, ScanBatchStack>();
  for (const scan of scans) {
    const stack = {
      card_printing_id: scan.printing.printingId,
      finish: scan.finish,
      condition: scan.condition,
      language: scan.language,
    };
    const key = Object.values(stack).join('|');
    stacks.set(key, { ...stack, copy_ids: [...(stacks.get(key)?.copy_ids ?? []), scan.scanId] });
  }
  return [...stacks.values()];
}

export function sameTextTwinsFirst(scan: BatchScan, printings: readonly Printing[]): Printing[] {
  const oracleId = scan.printing.oracleId;
  const twins = scan.options.slice(0, scan.sameTextTwinCount + 1).filter((option) => option.oracleId === oracleId);
  const twinIds = new Set(twins.map((twin) => twin.printingId));
  return [...twins, ...printings.filter((printing) => !twinIds.has(printing.printingId))];
}
