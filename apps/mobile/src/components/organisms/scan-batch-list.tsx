import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { ListRow } from '@/components/molecules/list-row';
import { SheetSection } from '@/components/molecules/sheet-section';
import { copyDetails } from '@/scan/printing-caption';
import type { BatchScan } from '@/scan/scan-batch';

type ScanBatchListProps = {
  scans: readonly BatchScan[];
  onOpen?: (scanId: string) => void;
};

export function ScanBatchList({ scans, onOpen }: ScanBatchListProps) {
  const imageOf = usePrintingImages(scans.map((scan) => scan.printing.printingId));

  return scans.length > 0 ? (
    <SheetSection title="Scans">
      {scans.map((scan) => (
        <ListRow
          key={scan.scanId}
          title={scan.printing.name}
          detail={copyDetails(scan).join(' · ')}
          leading={<CardThumbnail uri={imageOf(scan.printing.printingId)} />}
          onPress={onOpen && (() => onOpen(scan.scanId))}
        />
      ))}
    </SheetSection>
  ) : null;
}
