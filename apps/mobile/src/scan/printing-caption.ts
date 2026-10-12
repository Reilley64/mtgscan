import { finishLabels } from '@/collection/copy-labels';

import type { BatchScan, Printing } from './scan-batch';

export function printingCaption(printing: Printing) {
  return `${printing.setCode.toUpperCase()} ${printing.collectorNumber}`;
}

export function copiesDetail(copies: number): string[] {
  return copies > 1 ? [`${copies} copies`] : [];
}

export function chipDetails(scan: BatchScan & { printing: Printing }) {
  return [
    printingCaption(scan.printing),
    ...(scan.finish === 'nonfoil' ? [] : [finishLabels[scan.finish]]),
    ...copiesDetail(scan.copies),
  ];
}
