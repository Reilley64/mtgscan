import { SymbolView } from 'expo-symbols';

import { useSetIcons } from '@/catalog/use-set-icons';
import { finishes, finishLabels } from '@/collection/copy-labels';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { SetIcon } from '@/components/atoms/set-icon';
import { QuickActionBar } from '@/components/molecules/quick-action-bar';
import type { BatchScan, RecognizedScan } from '@/scan/scan-batch';
import { colors, sizes } from '@/theme';

type ScanQuickActionsProps = {
  scan: RecognizedScan | null;
  onAddCopy: (scanId: string) => void;
  onChangeFinish: (scanId: string, finish: BatchScan['finish']) => void;
  onChangeSet: (scanId: string) => void;
};

function SetAction({ setCode, onPress }: { setCode: string; onPress: () => void }) {
  const iconOf = useSetIcons([setCode]);
  const icon = iconOf(setCode);
  return (
    <QuickActionButton label={setCode.toUpperCase()} onPress={onPress}>
      {icon ? <SetIcon uri={icon} /> : null}
    </QuickActionButton>
  );
}

export function ScanQuickActions({ scan, onAddCopy, onChangeFinish, onChangeSet }: ScanQuickActionsProps) {
  if (!scan) {
    return (
      <QuickActionBar>
        <QuickActionButton label="Finish" />
        <QuickActionButton label="Set">
          <SymbolView name="square.dashed" tintColor={colors.textDim} size={sizes.setIcon} />
        </QuickActionButton>
        <QuickActionButton label="+1" />
      </QuickActionBar>
    );
  }
  const printingFinishes = finishes.filter((finish) => scan.printing.finishes.includes(finish));
  const nextFinish = printingFinishes[(printingFinishes.indexOf(scan.finish) + 1) % printingFinishes.length];
  return (
    <QuickActionBar>
      <QuickActionButton
        label={finishLabels[scan.finish]}
        onPress={printingFinishes.length > 1 ? () => onChangeFinish(scan.scanId, nextFinish) : undefined}
      />
      <SetAction setCode={scan.printing.setCode} onPress={() => onChangeSet(scan.scanId)} />
      <QuickActionButton label="+1" onPress={() => onAddCopy(scan.scanId)} />
    </QuickActionBar>
  );
}
