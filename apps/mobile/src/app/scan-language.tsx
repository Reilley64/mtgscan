import { router, useLocalSearchParams } from 'expo-router';

import { languageNames, languages } from '@/collection/copy-labels';
import { ChoiceSheet } from '@/components/templates/choice-sheet';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

export default function ScanLanguageSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);

  return scan ? (
    <ChoiceSheet
      title="Language"
      values={languages}
      selected={scan.language}
      labelOf={(language) => languageNames[language]}
      onSelect={(language) => {
        dispatch({ type: 'setLanguage', scanId, language });
        router.back();
      }}
    />
  ) : null;
}
