import { expect } from 'bun:test';

import type { CardCondition, CardLanguage } from '../collection';
import type { Finish } from '../search';
import { secretKeyClient, type TestUser } from './local-stack';

export type SeededCopies = {
  card_printing_id: string;
  finish?: Finish;
  condition?: CardCondition;
  language?: CardLanguage;
  is_protected?: boolean;
  quantity?: number;
  added_at?: string;
};

export async function seedCopies(user: TestUser, seeds: SeededCopies[]): Promise<string[][]> {
  const client = secretKeyClient();
  const lines = seeds.map((seed) => ({
    addition_id: crypto.randomUUID(),
    user_id: user.userId,
    card_printing_id: seed.card_printing_id,
    finish: seed.finish ?? 'nonfoil',
    condition: seed.condition ?? 'near_mint',
    language: seed.language ?? 'en',
    quantity: seed.quantity ?? 1,
  }));
  const copies = lines.map((line) => Array.from({ length: line.quantity }, () => ({ ...line, copy_id: crypto.randomUUID() })));
  const additions = lines.map((line, index) => ({
    id: line.addition_id,
    user_id: user.userId,
    added_at: seeds[index]!.added_at ?? new Date().toISOString(),
    copy_count: line.quantity,
    source: 'scan_batch' as const,
  }));
  const addedCopies = copies.flat().map(({ quantity, ...copy }) => copy);

  expect((await client.from('collection_additions').insert(additions)).error).toBeNull();
  expect((await client.from('collection_addition_lines').insert(lines)).error).toBeNull();
  expect((await client.from('collection_addition_copies').insert(addedCopies)).error).toBeNull();
  const { error } = await client.from('copies').insert(
    copies.flatMap((ofSeed, index) =>
      ofSeed.map(({ copy_id, quantity, ...copy }) => ({
        ...copy,
        id: copy_id,
        is_protected: seeds[index]!.is_protected ?? false,
      })),
    ),
  );
  expect(error).toBeNull();
  return copies.map((ofSeed) => ofSeed.map((copy) => copy.copy_id));
}
