import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { conditionLabels, conditions, finishLabels, languageNames, languages } from '@/collection/copy-labels';
import { Button } from '@/components/atoms/button';
import { CardImage } from '@/components/atoms/card-image';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Text } from '@/components/atoms/text';
import { ChipGroup } from '@/components/molecules/chip-group';
import { ListRow } from '@/components/molecules/list-row';
import { SheetSection } from '@/components/molecules/sheet-section';
import { copiesDetail, printingCaption } from '@/scan/printing-caption';
import type { RecognizedScan, ScanBatchAction } from '@/scan/scan-batch';

type ScanDetailsContentProps = {
  scan: RecognizedScan;
  dispatch: (action: ScanBatchAction) => void;
  onSearch: () => void;
  onRemove: () => void;
};

export function ScanDetailsContent({ scan, dispatch, onSearch, onRemove }: ScanDetailsContentProps) {
  const { printing, scanId } = scan;
  const otherOptions = scan.options.filter((option) => option.printingId !== printing.printingId);
  const imageOf = usePrintingImages([printing, ...otherOptions].map((option) => option.printingId));
  const caption = [printingCaption(printing), ...copiesDetail(scan.copies)].join(' · ');

  return (
    <View className="gap-lg">
      <View className="items-center gap-xs">
        <View accessible accessibilityRole="image" accessibilityLabel={printing.name} className="mb-sm w-[55%]">
          <CardImage uri={imageOf(printing.printingId)} />
        </View>
        <Text variant="card-title" className="text-center">
          {printing.name}
        </Text>
        <Text variant="meta">{caption}</Text>
      </View>
      <SheetSection title="Finish">
        <ChipGroup
          values={printing.finishes}
          selected={scan.finish}
          labelOf={(finish) => finishLabels[finish]}
          onSelect={(finish) => dispatch({ type: 'setFinish', scanId, finish })}
        />
      </SheetSection>
      <SheetSection title="Condition">
        <ChipGroup
          values={conditions}
          selected={scan.condition}
          labelOf={(condition) => conditionLabels[condition]}
          onSelect={(condition) => dispatch({ type: 'setCondition', scanId, condition })}
        />
      </SheetSection>
      <SheetSection title="Language">
        <ChipGroup
          values={languages}
          selected={scan.language}
          labelOf={(language) => languageNames[language]}
          onSelect={(language) => dispatch({ type: 'setLanguage', scanId, language })}
        />
      </SheetSection>
      {otherOptions.length > 0 ? (
        <SheetSection title="Other options">
          {otherOptions.map((option) => (
            <ListRow
              key={option.printingId}
              title={option.name}
              detail={printingCaption(option)}
              leading={<CardThumbnail uri={imageOf(option.printingId)} />}
              onPress={() => dispatch({ type: 'choose', scanId, printing: option })}
            />
          ))}
        </SheetSection>
      ) : null}
      <Button onPress={onSearch}>
        <Text>None of these: search</Text>
      </Button>
      <Button variant="danger" onPress={onRemove}>
        <Text>Remove scan</Text>
      </Button>
    </View>
  );
}
