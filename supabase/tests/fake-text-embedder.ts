export const embeddingDimensions = 384;

function wordBucket(word: string): number {
  let hash = 0;
  for (const character of word) {
    hash = (hash * 31 + character.charCodeAt(0)) % embeddingDimensions;
  }
  return hash;
}

export function wordCountEmbedding(text: string): number[] {
  const embedding = new Array<number>(embeddingDimensions).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    embedding[wordBucket(word)]! += 1;
  }
  const length = Math.hypot(...embedding) || 1;
  return embedding.map((value) => value / length);
}
