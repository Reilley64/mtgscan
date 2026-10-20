import type { TrainingCrop } from '../training-crops';

export const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
export const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

export function evidenceRecord(changes: Partial<TrainingCrop> = {}): TrainingCrop {
  return {
    crop_id: crypto.randomUUID(),
    accepted: true,
    decision_basis: 'collector_line',
    decision_reasons: ['collector line MH2 1 matches a card in the image shortlist'],
    top_similarity: 0.91,
    art_margin: 0.12,
    reading_set_code: 'mh2',
    reading_collector_number: '1',
    reading_premium_mark: false,
    reading_names_saved_printing: true,
    same_text_twin_count: 0,
    recognizer_version: '1.0.0 (42)',
    feature_print_model: 'pe-core-s16-384',
    gallery_version: '20261012-cf1753',
    recognized_printing_id: angelicCurator,
    saved_printing_id: angelicCurator,
    printing_change: null,
    printing_confirmed: false,
    policy_version: 1,
    ...changes,
  };
}

export function jpeg(bytes = 1_024): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(bytes)], { type: 'image/jpeg' });
}
