import { type ImportClient, ImportFailed } from './import-run';

export async function recomputeDeckEvaluations(client: ImportClient): Promise<void> {
  const startedAt = performance.now();
  const { data, error } = await client.rpc('recompute_deck_evaluations');
  if (error) {
    throw new ImportFailed(`Recompute deck evaluations: ${error.message}`);
  }
  console.log(`Recomputed ${data} deck evaluations in ${Math.round(performance.now() - startedAt)} ms.`);
}

export async function recomputeBehindDeckEvaluations(client: ImportClient): Promise<void> {
  const { data, error } = await client.rpc('deck_evaluations_are_behind');
  if (error) {
    throw new ImportFailed(`Deck evaluations behind: ${error.message}`);
  }
  if (!data) {
    console.log('No deck evaluation is behind.');
    return;
  }
  await recomputeDeckEvaluations(client);
}
