import { router, useNavigation } from 'expo-router';

import { conditionLabels, conditions, languageNames, languages } from '@/collection/copy-labels';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { ChipGroup } from '@/components/molecules/chip-group';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { SheetSection } from '@/components/molecules/sheet-section';
import { ScanBatchList } from '@/components/organisms/scan-batch-list';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { scansToAdd } from '@/scan/scan-batch';
import { useScanBatch } from '@/scan/scan-batch-state';

export default function BatchReviewSheet() {
  const navigation = useNavigation();
  const { batch, dispatch, commit, commitStatus } = useScanBatch();
  const copyCount = scansToAdd(batch).length;

  const addToCollection = async () => {
    if ((await commit()) && navigation.isFocused()) {
      router.back();
    }
  };

  const footer = (
    <>
      {commitStatus === 'failed' ? (
        <FailureNotice message="Could not add to your collection. Your scans are kept." />
      ) : null}
      <Button
        variant="primary"
        disabled={copyCount === 0}
        busy={commitStatus === 'adding'}
        onPress={() => void addToCollection()}>
        <Text>{commitStatus === 'failed' ? 'Try again' : `Add ${copyCount} to collection`}</Text>
      </Button>
    </>
  );

  return (
    <DrawerSheet title="Scan batch" footer={footer}>
      <SheetSection title="Condition for new scans">
        <ChipGroup
          values={conditions}
          selected={batch.defaults.condition}
          labelOf={(condition) => conditionLabels[condition]}
          onSelect={(condition) => dispatch({ type: 'setDefaults', defaults: { condition } })}
        />
      </SheetSection>
      <SheetSection title="Language for new scans">
        <ChipGroup
          values={languages}
          selected={batch.defaults.language}
          labelOf={(language) => languageNames[language]}
          onSelect={(language) => dispatch({ type: 'setDefaults', defaults: { language } })}
        />
      </SheetSection>
      <ScanBatchList
        scans={[...batch.scans].reverse()}
        onOpen={
          commitStatus === 'adding'
            ? undefined
            : (scanId) => router.push({ pathname: '/scan-details', params: { scanId } })
        }
      />
    </DrawerSheet>
  );
}
