import { addScanBatch, type ScanBatch, type ScanBatchStack } from '../collection';
import { call, expectReplied } from './database-calls';
import type { AppClient, TestUser } from './local-stack';

type StackChanges = Partial<Omit<ScanBatchStack, 'card_printing_id' | 'copy_ids'>> & { copies?: number };

export function copyIds(count: number) {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

export function stack(cardPrintingId: string, { copies = 1, ...changes }: StackChanges = {}): ScanBatchStack {
  return {
    card_printing_id: cardPrintingId,
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    copy_ids: copyIds(copies),
    ...changes,
  };
}

export function scanBatch(items: unknown[]): ScanBatch {
  return { items: items as ScanBatchStack[] };
}

export function scanned(user: { client: AppClient }, batch: ScanBatch | Record<string, unknown> | unknown[]) {
  return call(user.client, addScanBatch, batch as ScanBatch);
}

export async function committed(user: TestUser, batch: ScanBatch) {
  return expectReplied(await scanned(user, batch));
}
