import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { chipDetails } from '@/scan/printing-caption';
import { recognizedScan, type BatchScan, type Printing } from '@/scan/scan-batch';
import type { LatestScan } from '@/scan/scan-batch-state';
import { colors, sizes } from '@/theme';

const chipClass = 'flex-row items-center gap-md py-sm pl-sm pr-lg';

type LatestScanChipProps = {
  latest: LatestScan;
  onOpen: (scanId: string) => void;
};

function SkeletonChip() {
  return (
    <Surface accessible accessibilityRole="progressbar" accessibilityLabel="Recognizing card" className={chipClass}>
      <Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />
      <View className="flex-1 gap-xs">
        <Skeleton className="h-skeleton-title-bar w-[70%]" />
        <Skeleton className="h-skeleton-meta-bar w-[40%]" />
      </View>
    </Surface>
  );
}

function ChipText({ name, details }: { name: string; details: string[] }) {
  return (
    <View className="flex-1 gap-xs">
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
    <Surface accessible accessibilityLabel={`${printing.name}, Basic land, not tracked`} className={chipClass}>
      <CardThumbnail uri={image} />
      <ChipText name={printing.name} details={['Basic land, not tracked']} />
    </Surface>
  );
}

function ScanChip({ scan, image, onOpen }: { scan: BatchScan; image: string | undefined; onOpen: (scanId: string) => void }) {
  const recognized = recognizedScan(scan);
  const name = recognized ? recognized.printing.name : 'Not recognized';
  const details = recognized ? chipDetails(recognized) : ['Tap to search'];
  return (
    <Surface accessibilityLabel={[name, ...details].join(', ')} onPress={() => onOpen(scan.scanId)} className={chipClass}>
      <CardThumbnail uri={image} />
      <ChipText name={name} details={details} />
      <SymbolView name="chevron.right" tintColor={colors.textDim} size={sizes.chevron} />
    </Surface>
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
      return <ScanChip scan={latest.scan} image={image} onOpen={onOpen} />;
  }
}
