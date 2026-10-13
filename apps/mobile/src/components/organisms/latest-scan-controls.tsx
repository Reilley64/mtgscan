import { GlassGroup } from '@/components/atoms/glass-surface';
import { LatestScanChip } from '@/components/organisms/latest-scan-chip';
import { ScanQuickActions } from '@/components/organisms/scan-quick-actions';
import { recognizedScan, type BatchScan } from '@/scan/scan-batch';
import type { LatestScan } from '@/scan/scan-batch-state';

type LatestScanControlsProps = {
  latest: LatestScan | null;
  onOpen: (scanId: string) => void;
  onAddCopy: (scanId: string) => void;
  onChangeFinish: (scanId: string, finish: BatchScan['finish']) => void;
  onChangeCondition: (scanId: string) => void;
  onChangeSet: (scanId: string) => void;
  onChangeLanguage: (scanId: string) => void;
};

export function LatestScanControls({ latest, onOpen, ...quickActions }: LatestScanControlsProps) {
  return (
    <GlassGroup className="gap-sm">
      {latest ? <LatestScanChip latest={latest} onOpen={onOpen} /> : null}
      <ScanQuickActions scan={recognizedScan(latest?.kind === 'scan' ? latest.scan : null)} {...quickActions} />
    </GlassGroup>
  );
}
