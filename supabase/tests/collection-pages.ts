import { collectionCopyPage, collectionEntryPage, getCollectionTotal, searchCollection, type CollectionQuery } from '../collection';
import { replyOf } from './database-calls';
import type { AppClient, TestUser } from './local-stack';

export async function collectionEntries(client: AppClient, query: CollectionQuery = {}) {
  return collectionEntryPage.parse(await replyOf(client, searchCollection, query));
}

export async function collectionCopies(client: AppClient, query: CollectionQuery = {}) {
  return collectionCopyPage.parse(await replyOf(client, searchCollection, { ...query, rows: 'copies' }));
}

export function collectionTotal(user: TestUser) {
  return replyOf(user.client, getCollectionTotal, {});
}
