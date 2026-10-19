import { expect } from 'bun:test';

import type { CardCondition, CardLanguage, CollectionRow } from '../collection';
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

type CollectionEntryProperties = Pick<CollectionRow, 'printing_id' | 'finish' | 'condition' | 'language' | 'protected'>;

export function collectionEntryKey(entry: CollectionEntryProperties) {
  return [entry.printing_id, entry.finish, entry.condition, entry.language, entry.protected].join(' ');
}

function withDefaults(seed: SeededCopies) {
  return {
    finish: 'nonfoil' as const,
    condition: 'near_mint' as const,
    language: 'en' as const,
    is_protected: false,
    quantity: 1,
    ...seed,
  };
}

export function seededCollectionEntryKey(seed: SeededCopies) {
  const { card_printing_id, finish, condition, language, is_protected } = withDefaults(seed);
  return collectionEntryKey({ printing_id: card_printing_id, finish, condition, language, protected: is_protected });
}

export async function seedCopies(user: TestUser, seeds: SeededCopies[]): Promise<string[][]> {
  const client = secretKeyClient();
  const lines = seeds.map(withDefaults).map(({ card_printing_id, finish, condition, language, quantity }) => ({
    addition_id: crypto.randomUUID(),
    user_id: user.userId,
    card_printing_id,
    finish,
    condition,
    language,
    quantity,
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
        created_at: additions[index]!.added_at,
      })),
    ),
  );
  expect(error).toBeNull();
  return copies.map((ofSeed) => ofSeed.map((copy) => copy.copy_id));
}
