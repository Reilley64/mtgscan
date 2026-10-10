import type { ImportAdapter, StagedRow } from './import-run';
import { type BulkFile, readBulkFiles, readBulkRecords } from './scryfall-bulk-data';

type ScryfallOracleTag = {
  id?: string;
  slug?: string;
  label?: string;
  description?: string | null;
  aliases?: string[];
  parent_ids?: string[];
  taggings?: { oracle_id?: string }[];
};

function tagRows(tag: ScryfallOracleTag): StagedRow[] {
  const tagId = tag.id ?? null;
  return [
    {
      target: 'oracle_tags',
      row: {
        id: tagId,
        slug: tag.slug ?? null,
        label: tag.label ?? null,
        description: tag.description ?? null,
        aliases: tag.aliases ?? null,
      },
    },
    ...(tag.parent_ids ?? []).map((parentId) => ({
      target: 'tag_edges',
      row: { parent_id: parentId, child_id: tagId },
    })),
    ...(tag.taggings ?? []).map((tagging) => ({
      target: 'card_taggings',
      row: { tag_id: tagId, oracle_id: tagging.oracle_id ?? null },
    })),
  ];
}

async function* oracleTagRows(file: BulkFile): AsyncGenerator<StagedRow> {
  for await (const tag of readBulkRecords<ScryfallOracleTag>(file)) {
    yield* tagRows(tag);
  }
}

export async function scryfallOracleTags(manifestLocation: string): Promise<ImportAdapter> {
  const { oracle_tags: file } = await readBulkFiles(manifestLocation, ['oracle_tags']);
  return {
    source: 'oracle_tags',
    sourceUpdatedAt: new Date(file.updated_at),
    rows: () => oracleTagRows(file),
  };
}
