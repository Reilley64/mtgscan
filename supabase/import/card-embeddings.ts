import { type ImportAdapter, type ImportClient, ImportFailed, type StagedRow } from './import-run';

export type Embedder = (text: string) => Promise<number[]>;

const embeddingModel = { name: 'Supabase/gte-small', revision: '93b36ff09519291b77d6000d2e86bd8565378086' };

const textPageRows = 1000;
const progressEvery = 1000;

export async function gteSmallEmbedder(): Promise<Embedder> {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', embeddingModel.name, {
    dtype: 'fp32',
    revision: embeddingModel.revision,
  });
  return async (text) => Array.from((await extractor(text, { pooling: 'mean', normalize: true })).data as Float32Array);
}

async function* cardEmbeddingRows(client: ImportClient, loadEmbedder: () => Promise<Embedder>): AsyncGenerator<StagedRow> {
  let embedder: Embedder | undefined;
  let embedded = 0;
  const startedAt = performance.now();
  const elapsedSeconds = () => Math.round((performance.now() - startedAt) / 1000);
  for (let afterOracleId: string | undefined; ; ) {
    const { data, error } = await client.rpc('list_card_embedding_texts', {
      after_oracle_id: afterOracleId,
      row_limit: textPageRows,
    });
    if (error) {
      throw new ImportFailed(`Read embedding texts: ${error.message}`);
    }
    for (const card of data) {
      embedder ??= await loadEmbedder();
      yield {
        target: 'card_embeddings',
        row: {
          oracle_id: card.oracle_id,
          embedding_text_md5: card.embedding_text_md5,
          embedding: await embedder(card.embedding_text),
        },
      };
      embedded += 1;
      if (embedded % progressEvery === 0) {
        console.log(`Embedded ${embedded} cards in ${elapsedSeconds()} s.`);
      }
    }
    if (data.length < textPageRows) {
      console.log(`Embedded ${embedded} cards with new embedding text in ${elapsedSeconds()} s.`);
      return;
    }
    afterOracleId = data.at(-1)!.oracle_id;
  }
}

export function cardEmbeddings(client: ImportClient, loadEmbedder: () => Promise<Embedder>): ImportAdapter {
  return {
    source: 'card_embeddings',
    sourceUpdatedAt: new Date(),
    rows: () => cardEmbeddingRows(client, loadEmbedder),
  };
}
