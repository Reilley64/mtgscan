import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { ListRow } from '@/components/molecules/list-row';
import { SheetSection } from '@/components/molecules/sheet-section';
import { copyDetails } from '@/scan/printing-caption';
import { recognizedScan, type BatchScan } from '@/scan/scan-batch';

type ScanBatchListProps = {
  scans: readonly BatchScan[];
  onOpen?: (scanId: string) => void;
};

export function ScanBatchList({ scans, onOpen }: ScanBatchListProps) {
  const recognized = scans.flatMap((scan) => recognizedScan(scan) ?? []);
  const notRecognized = scans.filter((scan) => !scan.printing);
  const imageOf = usePrintingImages(recognized.map((scan) => scan.printing.printingId));

  return (
    <>
      {notRecognized.length > 0 ? (
        <SheetSection title="Not recognized">
          {notRecognized.map((scan) => (
            <ListRow
              key={scan.scanId}
              title="Not recognized"
              detail="Tap to search"
              leading={<CardThumbnail uri={undefined} />}
              onPress={onOpen && (() => onOpen(scan.scanId))}
            />
          ))}
        </SheetSection>
      ) : null}
      {recognized.length > 0 ? (
        <SheetSection title="Scans">
          {recognized.map((scan) => (
            <ListRow
              key={scan.scanId}
              title={scan.printing.name}
              detail={copyDetails(scan).join(' · ')}
              leading={<CardThumbnail uri={imageOf(scan.printing.printingId)} />}
              onPress={onOpen && (() => onOpen(scan.scanId))}
            />
          ))}
        </SheetSection>
      ) : null}
    </>
  );
}
