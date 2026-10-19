import type { Database } from '@mtgscan/supabase/database.types';

import type { BatchScan, ScanTrainingCrop } from './scan-batch';

export type EvidenceRecord = Omit<Database['public']['Tables']['training_crops']['Row'], 'crop_id'>;

const policyVersion = 1;

export function evidenceRecordOf(scan: BatchScan, trainingCrop: ScanTrainingCrop): EvidenceRecord {
  const { reading } = trainingCrop;
  return {
    accepted: trainingCrop.accepted,
    decision_basis: trainingCrop.decisionBasis,
    decision_reasons: [...trainingCrop.decisionReasons],
    top_similarity: trainingCrop.topSimilarity,
    art_margin: trainingCrop.artMargin,
    reading_set_code: reading.setCode ?? null,
    reading_collector_number: reading.collectorNumber ?? null,
    reading_premium_mark: reading.premiumMark,
    reading_names_saved_printing:
      reading.setCode?.toLowerCase() === scan.printing.setCode.toLowerCase() &&
      reading.collectorNumber === scan.printing.collectorNumber,
    same_text_twin_count: scan.sameTextTwinCount,
    recognizer_version: trainingCrop.recognizerVersion,
    feature_print_revision: trainingCrop.featurePrintRevision,
    gallery_version: trainingCrop.galleryVersion,
    recognized_printing_id: trainingCrop.recognizedPrintingId,
    saved_printing_id: scan.printing.printingId,
    printing_change: null,
    printing_confirmed: false,
    policy_version: policyVersion,
  };
}
