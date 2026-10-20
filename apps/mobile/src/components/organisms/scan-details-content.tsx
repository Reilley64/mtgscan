import { View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { conditionLabels, conditions, finishLabels, languageNames, languages } from '@/collection/copy-labels';
import { Button } from '@/components/atoms/button';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Text } from '@/components/atoms/text';
import { ChipGroup } from '@/components/molecules/chip-group';
import { LargeCardImage } from '@/components/molecules/large-card-image';
import { ListRow } from '@/components/molecules/list-row';
import { SheetSection } from '@/components/molecules/sheet-section';
import { printingCaption } from '@/scan/printing-caption';
import type { BatchScan, ScanEdit } from '@/scan/scan-batch';

type ScanDetailsContentProps = {
  scan: BatchScan;
  dispatch: (action: ScanEdit) => void;
  onSearch: () => void;
  onRemove?: () => void;
};

export function ScanDetailsContent({ scan, dispatch, onSearch, onRemove }: ScanDetailsContentProps) {
  const { printing, scanId } = scan;
  const otherOptions = scan.options.filter((option) => option.printingId !== printing.printingId);
  const imageOf = usePrintingImages([printing, ...otherOptions].map((option) => option.printingId));

  return (
    <View className="gap-lg">
      <View className="items-center gap-md">
        <LargeCardImage uri={imageOf(printing.printingId)} name={printing.name} />
        <View className="items-center gap-xs">
          <Text variant="card-title" className="text-center">
            {printing.name}
          </Text>
          <Text variant="meta">{printingCaption(printing)}</Text>
        </View>
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
              onPress={() => dispatch({ type: 'choose', scanId, printing: option, printingChange: 'other_options' })}
            />
          ))}
        </SheetSection>
      ) : null}
      <Button onPress={onSearch}>
        <Text>None of these: search</Text>
      </Button>
      {onRemove ? (
        <Button variant="danger" onPress={onRemove}>
          <Text>Remove scan</Text>
        </Button>
      ) : null}
    </View>
  );
}
