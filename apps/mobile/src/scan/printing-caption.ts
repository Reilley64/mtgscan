import { conditionLabels, finishDetails, languageNames } from '@/collection/copy-labels';

import type { Printing, RecognizedScan } from './scan-batch';

export function printingCaption(printing: Printing) {
  return `${printing.setCode.toUpperCase()} ${printing.collectorNumber}`;
}

export function chipDetails(scan: RecognizedScan) {
  return [printingCaption(scan.printing), ...finishDetails(scan.finish)];
}

export function copyDetails(scan: RecognizedScan) {
  return [...chipDetails(scan), conditionLabels[scan.condition], languageNames[scan.language]];
}
