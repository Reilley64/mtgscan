import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { Skeleton } from '@/components/atoms/skeleton';
import { Text } from '@/components/atoms/text';
import { PriceLine } from '@/components/molecules/price-line';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
import { useScanPrices, type ScanPrice } from '@/scan/current-prices';
import { chipDetails } from '@/scan/printing-caption';
import type { Printing } from '@/scan/scan-batch';
import type { LatestScan } from '@/scan/scan-batch-state';
import { sizes } from '@/theme';

type LatestScanChipProps = {
  latest: LatestScan;
  onOpen: (scanId: string) => void;
};

function SkeletonChip() {
  return (
    <ThumbnailChip
      accessibilityRole="progressbar"
      accessibilityLabel="Recognizing card"
      thumbnail={<Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />}>
      <View className="items-center gap-xs">
        <Skeleton className="h-skeleton-title-bar w-[70%]" />
        <Skeleton className="h-skeleton-meta-bar w-[40%]" />
      </View>
    </ThumbnailChip>
  );
}

function ChipText({ name, details, price }: { name: string; details: string[]; price?: ScanPrice }) {
  const meta = details.join(' · ');
  return (
    <View className="gap-xs">
      <Text variant="body-strong" numberOfLines={1} className="text-center">
        {name}
      </Text>
      {price ? (
        <View className="flex-row items-center justify-center gap-xs">
          <Text variant="meta" numberOfLines={1} className="shrink">
            {`${meta} ·`}
          </Text>
          <PriceLine price={price.shown} stale={price.stale} tone="meta" />
        </View>
      ) : (
        <Text variant="meta" numberOfLines={1} className="text-center">
          {meta}
        </Text>
      )}
    </View>
  );
}

function BasicLandChip({ printing, image }: { printing: Printing; image: string | undefined }) {
  return (
    <ThumbnailChip accessibilityLabel={`${printing.name}, Basic land, not tracked`} thumbnail={<CardThumbnail uri={image} />}>
      <ChipText name={printing.name} details={['Basic land, not tracked']} />
    </ThumbnailChip>
  );
}

type ScanChipProps = {
  name: string;
  details: string[];
  price?: ScanPrice;
  image: string | undefined;
  onOpen: () => void;
};

function ScanChip({ name, details, price, image, onOpen }: ScanChipProps) {
  return (
    <ThumbnailChip
      accessibilityLabel={[name, ...details, ...(price ? [price.spoken] : [])].join(', ')}
      onPress={onOpen}
      thumbnail={<CardThumbnail uri={image} />}
      accessory={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
      <ChipText name={name} details={details} price={price} />
    </ThumbnailChip>
  );
}

export function LatestScanChip({ latest, onOpen }: LatestScanChipProps) {
  const scans = latest.kind === 'scan' ? [latest.scan] : [];
  const printing = scans[0]?.printing ?? (latest.kind === 'basic_land' ? latest.printing : null);
  const imageOf = usePrintingImages(printing ? [printing.printingId] : []);
  const image = printing ? imageOf(printing.printingId) : undefined;
  const priceOf = useScanPrices(scans);
  switch (latest.kind) {
    case 'recognizing':
      return <SkeletonChip />;
    case 'basic_land':
      return <BasicLandChip printing={latest.printing} image={image} />;
    case 'scan':
      return (
        <ScanChip
          name={latest.scan.printing.name}
          details={chipDetails(latest.scan)}
          price={priceOf(latest.scan)}
          image={image}
          onOpen={() => onOpen(latest.scan.scanId)}
        />
      );
    case 'not_recognized':
      return (
        <ScanChip name="Not recognized" details={['Tap to search']} image={undefined} onOpen={() => onOpen(latest.scanId)} />
      );
  }
}
