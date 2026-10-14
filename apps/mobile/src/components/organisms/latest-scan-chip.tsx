import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { Skeleton } from '@/components/atoms/skeleton';
import { Text } from '@/components/atoms/text';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
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

function ChipText({ name, details }: { name: string; details: string[] }) {
  return (
    <View className="gap-xs">
      <Text variant="body-strong" numberOfLines={1} className="text-center">
        {name}
      </Text>
      <Text variant="meta" numberOfLines={1} className="text-center">
        {details.join(' · ')}
      </Text>
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

type ScanChipProps = { name: string; details: string[]; image: string | undefined; onOpen: () => void };

function ScanChip({ name, details, image, onOpen }: ScanChipProps) {
  return (
    <ThumbnailChip
      accessibilityLabel={[name, ...details].join(', ')}
      onPress={onOpen}
      thumbnail={<CardThumbnail uri={image} />}
      accessory={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
      <ChipText name={name} details={details} />
    </ThumbnailChip>
  );
}

export function LatestScanChip({ latest, onOpen }: LatestScanChipProps) {
  const printing = latest.kind === 'scan' ? latest.scan.printing : latest.kind === 'basic_land' ? latest.printing : null;
  const imageOf = usePrintingImages(printing ? [printing.printingId] : []);
  const image = printing ? imageOf(printing.printingId) : undefined;
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
          image={image}
          onOpen={() => onOpen(latest.scan.scanId)}
        />
      );
    case 'failed':
      return (
        <ScanChip name="Not recognized" details={['Tap to search']} image={undefined} onOpen={() => onOpen(latest.scanId)} />
      );
  }
}
