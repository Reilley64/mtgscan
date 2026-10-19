import { expect } from 'bun:test';

import type { CopyDetails, UserTagList } from '../collection';
import type { Json } from '../database.types';
import type { TestUser } from './local-stack';

export async function userTagsOf(user: TestUser, query: object = {}) {
  const { data, error } = await user.client.rpc('list_user_tags', { query: query as Json });
  expect(error).toBeNull();
  return (data as unknown as UserTagList).items;
}

export async function userTagsOnCopy(user: TestUser, copyId: string) {
  const { data, error } = await user.client.rpc('get_copy', { query: { copy_id: copyId } });
  expect(error).toBeNull();
  return (data as unknown as CopyDetails).user_tags;
}
