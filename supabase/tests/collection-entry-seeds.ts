import { expect } from 'bun:test';

import type { Database } from '../database.types';
import { secretKeyClient, type TestUser } from './local-stack';

type CollectionEntryRow = Database['public']['Tables']['collection_entries']['Insert'];

export type SeededEntry = Partial<Omit<CollectionEntryRow, 'user_id'>> & { card_printing_id: string };

export async function seedCollectionEntries(user: TestUser, entries: SeededEntry[]): Promise<string[]> {
  const { data, error } = await secretKeyClient()
    .from('collection_entries')
    .insert(
      entries.map((entry) => ({
        finish: 'nonfoil' as const,
        condition: 'near_mint' as const,
        language: 'en' as const,
        quantity: 1,
        is_protected: false,
        user_tag_ids: [],
        latest_addition_at: new Date().toISOString(),
        ...entry,
        user_id: user.userId,
      })),
    )
    .select('id');
  expect(error).toBeNull();
  return data!.map((row) => row.id);
}
