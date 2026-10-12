import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { printingCaption } from '@/scan/printing-caption';
import type { Printing } from '@/scan/scan-batch';

type PrintingPickerProps = {
  printings: readonly Printing[];
  selectedId?: string;
  onChoose: (printing: Printing) => void;
};

export function PrintingPicker({ printings, selectedId, onChoose }: PrintingPickerProps) {
  const imageOf = usePrintingImages(printings.map((printing) => printing.printingId));

  return (
    <CardGrid>
      {printings.map((printing) => {
        const caption = printingCaption(printing);
        return (
          <CardTile
            key={printing.printingId}
            uri={imageOf(printing.printingId)}
            caption={caption}
            accessibilityLabel={`${printing.name}, ${caption}`}
            selected={printing.printingId === selectedId}
            onPress={() => onChoose(printing)}
          />
        );
      })}
    </CardGrid>
  );
}
