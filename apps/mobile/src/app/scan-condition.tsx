import { router, useLocalSearchParams } from 'expo-router';

import { conditionLabels, conditions } from '@/collection/copy-labels';
import { ChoiceSheet } from '@/components/templates/choice-sheet';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

export default function ScanConditionSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);

  return scan ? (
    <ChoiceSheet
      title="Condition"
      values={conditions}
      selected={scan.condition}
      labelOf={(condition) => conditionLabels[condition]}
      onSelect={(condition) => {
        dispatch({ type: 'setCondition', scanId, condition });
        router.back();
      }}
    />
  ) : null;
}
