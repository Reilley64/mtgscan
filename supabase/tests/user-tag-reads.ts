import { getCopy, listUserTags } from '../collection';
import { replyOf } from './database-calls';
import type { TestUser } from './local-stack';

export async function userTagsOf(user: TestUser, query: { deleted?: boolean } = {}) {
  return (await replyOf(user.client, listUserTags, query)).items;
}

export async function userTagsOnCopy(user: TestUser, copyId: string) {
  return (await replyOf(user.client, getCopy, { copy_id: copyId })).user_tags;
}
