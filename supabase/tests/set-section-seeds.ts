import { expect } from 'bun:test';

import type { ImportedSetSection } from '../import/scryfall-set-sections';
import { secretKeyClient } from './local-stack';

export function importSetSections(setCode: string, sections: ImportedSetSection[]) {
  return secretKeyClient().rpc('import_set_sections', { set_code: setCode, sections });
}

export async function storeSetSections(setCode: string, sections: ImportedSetSection[]) {
  const { error } = await importSetSections(setCode, sections);
  expect(error).toBeNull();
}
