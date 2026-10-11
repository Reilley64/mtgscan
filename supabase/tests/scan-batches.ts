import { expect } from 'bun:test';

import { readScanBatchError, type ScanBatch, type ScanBatchResult, type ScanBatchStack } from '../collection';
import type { Json } from '../database.types';
import type { AppClient, TestUser } from './local-stack';

type StackChanges = Partial<Omit<ScanBatchStack, 'card_printing_id'>>;

export function stack(cardPrintingId: string, changes: StackChanges = {}): ScanBatchStack {
  return {
    card_printing_id: cardPrintingId,
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    quantity: 1,
    ...changes,
  };
}

export function scanBatch(items: unknown[]): ScanBatch {
  return { idempotency_key: crypto.randomUUID(), items: items as ScanBatchStack[] };
}

export async function addScanBatch(
  user: { client: AppClient },
  batch: ScanBatch | Record<string, unknown> | unknown[],
) {
  const { data, error } = await user.client.rpc('add_scan_batch', { batch: batch as Json });
  return { result: data as unknown as ScanBatchResult | null, error: error && readScanBatchError(error) };
}

export async function committed(user: TestUser, batch: ScanBatch) {
  const { result, error } = await addScanBatch(user, batch);
  expect(error).toBeNull();
  return result!;
}
