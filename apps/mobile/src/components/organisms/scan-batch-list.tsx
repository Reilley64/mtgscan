import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { ListRow } from '@/components/molecules/list-row';
import { PriceLine } from '@/components/molecules/price-line';
import { SheetSection } from '@/components/molecules/sheet-section';
import { useScanPrices } from '@/scan/current-prices';
import { copyDetails } from '@/scan/printing-caption';
import type { BatchScan } from '@/scan/scan-batch';

type ScanBatchListProps = {
  scans: readonly BatchScan[];
  onOpen?: (scanId: string) => void;
};

export function ScanBatchList({ scans, onOpen }: ScanBatchListProps) {
  const imageOf = usePrintingImages(scans.map((scan) => scan.printing.printingId));
  const priceOf = useScanPrices(scans);

  return scans.length > 0 ? (
    <SheetSection title="Scans">
      {scans.map((scan) => {
        const price = priceOf(scan);
        return (
          <ListRow
            key={scan.scanId}
            title={scan.printing.name}
            detail={copyDetails(scan).join(' · ')}
            trailing={price && { content: <PriceLine price={price.shown} stale={price.stale} />, spoken: price.spoken }}
            leading={<CardThumbnail uri={imageOf(scan.printing.printingId)} />}
            onPress={onOpen && (() => onOpen(scan.scanId))}
          />
        );
      })}
    </SheetSection>
  ) : null;
}
