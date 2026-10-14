import { conditionLabels, finishLabels, languageNames } from '@/collection/copy-labels';

import type { BatchScan, Printing } from './scan-batch';

export function printingCaption(printing: Printing) {
  return `${printing.setCode.toUpperCase()} ${printing.collectorNumber}`;
}

export function chipDetails(scan: BatchScan) {
  return [printingCaption(scan.printing), ...(scan.finish === 'nonfoil' ? [] : [finishLabels[scan.finish]])];
}

export function copyDetails(scan: BatchScan) {
  return [...chipDetails(scan), conditionLabels[scan.condition], languageNames[scan.language]];
}
