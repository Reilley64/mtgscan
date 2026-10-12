import { finishLabels } from '@/collection/copy-labels';

import type { BatchScan, Printing } from './scan-batch';

export function printingCaption(printing: Printing) {
  return `${printing.setCode.toUpperCase()} ${printing.collectorNumber}`;
}

export function copiesLabel(copies: number) {
  return `${copies} copies`;
}

export function scanDetails(scan: BatchScan & { printing: Printing }) {
  return [
    printingCaption(scan.printing),
    ...(scan.finish === 'nonfoil' ? [] : [finishLabels[scan.finish]]),
    ...(scan.copies > 1 ? [copiesLabel(scan.copies)] : []),
  ];
}
