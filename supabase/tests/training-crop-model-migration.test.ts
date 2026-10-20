import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { catalogFixtureManifest, runCatalogImport } from './catalog-import-command';
import { applyPendingMigrations, secretKeyClient, signUpNewUser, supabaseCli } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';
import { angelicCurator, evidenceRecord } from './training-crop-seeds';

setDefaultTimeout(180_000);

const migrationBeforeFeaturePrintModel = '20261229090000';

function visionEvidenceRecord(changes: Record<string, unknown> = {}) {
  const { feature_print_model: _, ...record } = evidenceRecord();
  return { ...record, feature_print_revision: 2, ...changes };
}

describe('the migration that names the feature print model of each training crop', () => {
  const visionCrops = [visionEvidenceRecord(), visionEvidenceRecord({ accepted: false, decision_basis: null })];

  afterAll(applyPendingMigrations);

  beforeAll(async () => {
    const reset = await supabaseCli('db', 'reset', '--local', '--no-seed', '--version', migrationBeforeFeaturePrintModel);
    expect(reset.exitCode).toBe(0);
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
    const user = await signUpNewUser();
    const scanned = stack(angelicCurator);
    await committed(user, scanBatch([scanned]));
    for (const crop of visionCrops) {
      const { error } = await secretKeyClient().rpc('add_training_crop', {
        request: { user_id: user.userId, copy_id: scanned.copy_ids[0]!, crop },
      } as never);
      expect(error).toBeNull();
    }

    const { exitCode, output } = await applyPendingMigrations();
    expect(output).toContain('20261231090000');
    expect(exitCode).toBe(0);
  });

  test('training crops stored before the switch keep their evidence record and name apple-vision-2 as their feature print model', async () => {
    const { data, error } = await secretKeyClient().from('training_crops').select('*').order('crop_id');

    expect(error).toBeNull();
    expect(data).toEqual(
      visionCrops
        .map(({ feature_print_revision: _, ...record }) => ({ ...record, feature_print_model: 'apple-vision-2' }))
        .toSorted((a, b) => a.crop_id.localeCompare(b.crop_id)),
    );
  });
});
