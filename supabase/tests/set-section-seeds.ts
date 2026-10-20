import { expect } from 'bun:test';

import { secretKeyClient } from './local-stack';

export type StoredSetSection = { name: string; search: string; card_printing_ids: string[] };

export function importSetSections(setCode: string, sections: StoredSetSection[]) {
  return secretKeyClient().rpc('import_set_sections', { set_code: setCode, sections });
}

export async function storeSetSections(setCode: string, sections: StoredSetSection[]) {
  const { error } = await importSetSections(setCode, sections);
  expect(error).toBeNull();
}
