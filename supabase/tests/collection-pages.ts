import { searchCollection, type CollectionCopyRow, type CollectionPage, type CollectionQuery, type CollectionRow } from '../collection';
import { replyOf } from './database-calls';
import type { AppClient } from './local-stack';

export async function collectionEntries(client: AppClient, query: CollectionQuery = {}) {
  return (await replyOf(client, searchCollection, query)) as CollectionPage<CollectionRow>;
}

export async function collectionCopies(client: AppClient, query: CollectionQuery = {}) {
  return (await replyOf(client, searchCollection, { ...query, rows: 'copies' })) as CollectionPage<CollectionCopyRow>;
}
