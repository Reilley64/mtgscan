import type { CardCondition, CardLanguage } from '@mtgscan/supabase/collection';
import type { Finish } from '@mtgscan/supabase/search';

import type { GalleryCardPrinting } from '../../modules/card-recognizer';

export type Printing = GalleryCardPrinting;

export type BatchScan = Readonly<{
  scanId: string;
  options: readonly Printing[];
  sameTextTwinCount: number;
  premiumMark: boolean;
  printing: Printing | null;
  finish: Finish;
  condition: CardCondition;
  language: CardLanguage;
  copies: number;
}>;

type BatchDefaults = Readonly<{
  condition: CardCondition;
  language: CardLanguage;
}>;

export type RecognizedScan = BatchScan & { printing: Printing };

export function recognizedScan(scan: BatchScan | null | undefined): RecognizedScan | null {
  return scan?.printing ? { ...scan, printing: scan.printing } : null;
}

export type ScanBatch = Readonly<{
  scans: readonly BatchScan[];
  defaults: BatchDefaults;
}>;

export type ScanBatchAction =
  | {
      type: 'recognized';
      scanId: string;
      candidates: readonly Printing[];
      sameTextTwinCount: number;
      premiumMark: boolean;
    }
  | { type: 'failed'; scanId: string }
  | { type: 'choose'; scanId: string; printing: Printing }
  | { type: 'setFinish'; scanId: string; finish: Finish }
  | { type: 'setCondition'; scanId: string; condition: CardCondition }
  | { type: 'setLanguage'; scanId: string; language: CardLanguage }
  | { type: 'addCopy'; scanId: string }
  | { type: 'removeCopy'; scanId: string };

export const emptyScanBatch: ScanBatch = {
  scans: [],
  defaults: { condition: 'near_mint', language: 'en' },
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

function addScan(batch: ScanBatch, scan: Omit<BatchScan, 'condition' | 'language' | 'copies'>): ScanBatch {
  if (batch.scans.some((existing) => existing.scanId === scan.scanId)) {
    return batch;
  }
  return {
    ...batch,
    scans: [
      ...batch.scans,
      { ...scan, condition: batch.defaults.condition, language: batch.defaults.language, copies: 1 },
    ],
  };
}

export function scanBatchReducer(batch: ScanBatch, action: ScanBatchAction): ScanBatch {
  switch (action.type) {
    case 'recognized': {
      const printing = action.candidates[0] ?? null;
      return addScan(batch, {
        scanId: action.scanId,
        options: action.candidates,
        sameTextTwinCount: action.sameTextTwinCount,
        premiumMark: action.premiumMark,
        printing,
        finish: printing ? defaultFinish(printing, action.premiumMark) : 'nonfoil',
      });
    }
    case 'failed':
      return addScan(batch, {
        scanId: action.scanId,
        options: [],
        sameTextTwinCount: 0,
        premiumMark: false,
        printing: null,
        finish: 'nonfoil',
      });
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
    case 'addCopy':
      return updateScan(batch, action.scanId, (scan) => ({ ...scan, copies: scan.copies + 1 }));
    case 'removeCopy':
      return {
        ...batch,
        scans: batch.scans.flatMap((scan) => {
          if (scan.scanId !== action.scanId) {
            return [scan];
          }
          return scan.copies > 1 ? [{ ...scan, copies: scan.copies - 1 }] : [];
        }),
      };
  }
}

export function sameTextTwinsFirst(scan: BatchScan, printings: readonly Printing[]): Printing[] {
  const oracleId = scan.printing?.oracleId;
  const twins = scan.options.slice(0, scan.sameTextTwinCount + 1).filter((option) => option.oracleId === oracleId);
  const twinIds = new Set(twins.map((twin) => twin.printingId));
  return [...twins, ...printings.filter((printing) => !twinIds.has(printing.printingId))];
}
