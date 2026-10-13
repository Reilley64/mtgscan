import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { GlassSurface } from '@/components/atoms/glass-surface';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { ThreeColumnRow } from '@/components/molecules/three-column-row';
import { chipDetails } from '@/scan/printing-caption';
import { recognizedScan, type BatchScan, type Printing } from '@/scan/scan-batch';
import type { LatestScan } from '@/scan/scan-batch-state';
import { sizes } from '@/theme';

const glassClass = 'rounded-md';

const chipClass = 'bg-transparent p-sm';

const sideColumnClass = 'w-card-thumbnail-width';

type LatestScanChipProps = {
  latest: LatestScan;
  onOpen: (scanId: string) => void;
};

function SkeletonChip() {
  return (
    <GlassSurface fallback="surface" className={glassClass}>
      <Surface accessible accessibilityRole="progressbar" accessibilityLabel="Recognizing card" className={chipClass}>
        <ThreeColumnRow
          sideClassName={sideColumnClass}
          start={<Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />}>
          <View className="items-center gap-xs">
            <Skeleton className="h-skeleton-title-bar w-[70%]" />
            <Skeleton className="h-skeleton-meta-bar w-[40%]" />
          </View>
        </ThreeColumnRow>
      </Surface>
    </GlassSurface>
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
    <GlassSurface fallback="surface" className={glassClass}>
      <Surface accessible accessibilityLabel={`${printing.name}, Basic land, not tracked`} className={chipClass}>
        <ThreeColumnRow sideClassName={sideColumnClass} start={<CardThumbnail uri={image} />}>
          <ChipText name={printing.name} details={['Basic land, not tracked']} />
        </ThreeColumnRow>
      </Surface>
    </GlassSurface>
  );
}

function ScanChip({ scan, image, onOpen }: { scan: BatchScan; image: string | undefined; onOpen: (scanId: string) => void }) {
  const recognized = recognizedScan(scan);
  const name = recognized ? recognized.printing.name : 'Not recognized';
  const details = recognized ? chipDetails(recognized) : ['Tap to search'];
  return (
    <GlassSurface fallback="surface" className={glassClass} interactive>
      <Surface accessibilityLabel={[name, ...details].join(', ')} onPress={() => onOpen(scan.scanId)} className={chipClass}>
        <ThreeColumnRow
          sideClassName={sideColumnClass}
          start={<CardThumbnail uri={image} />}
          end={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
          <ChipText name={name} details={details} />
        </ThreeColumnRow>
      </Surface>
    </GlassSurface>
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
