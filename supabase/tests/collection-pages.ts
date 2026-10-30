import { collectionCopyPage, getCollectionTotal, searchCollection, type CollectionQuery } from '../collection';
import { replyOf } from './database-calls';
import type { AppClient, TestUser } from './local-stack';

export async function collectionCopies(client: AppClient, query: CollectionQuery = {}) {
  return collectionCopyPage.parse(await replyOf(client, searchCollection, query));
}

export function collectionTotal(user: TestUser) {
  return replyOf(user.client, getCollectionTotal, {});
}
