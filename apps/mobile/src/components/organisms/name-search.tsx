import { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';

import { Input } from '@/components/atoms/input';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { SheetSection } from '@/components/molecules/sheet-section';
import { PrintingPicker } from '@/components/organisms/printing-picker';
import type { Printing } from '@/scan/scan-batch';

import { cardPrintings, searchCardNames, type CardName } from '../../../modules/card-recognizer';

type NameSearchProps = {
  onChoose: (printing: Printing) => void;
};

type ChosenCard = { card: CardName; printings: Printing[] | null };

function CardPrintings({ chosen, onChoose }: { chosen: ChosenCard; onChoose: (printing: Printing) => void }) {
  const printings = chosen.printings ?? [];

  if (chosen.printings === null) {
    return null;
  }
  if (printings.length > 0 && printings.every((printing) => printing.basicLand)) {
    return <Text className="text-text-muted">Basic lands are not tracked.</Text>;
  }
  return (
    <SheetSection title={chosen.card.name}>
      <PrintingPicker printings={printings} onChoose={onChoose} />
    </SheetSection>
  );
}

export function NameSearch({ onChoose }: NameSearchProps) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ text: string; names: CardName[] } | null>(null);
  const [chosen, setChosen] = useState<ChosenCard | null>(null);
  const latestText = useRef('');

  useEffect(() => {
    latestText.current = text;
    if (!text.trim()) {
      return;
    }
    searchCardNames(text).then(
      (names) => latestText.current === text && setFound({ text, names }),
      () => latestText.current === text && setFound(null),
    );
  }, [text]);

  const shownNames = text.trim() && found ? found.names : [];

  const chooseName = (card: CardName) => {
    Keyboard.dismiss();
    setChosen({ card, printings: null });
    cardPrintings(card.oracleId).then(
      (printings) => setChosen((current) => (current?.card === card ? { card, printings } : current)),
      () => setChosen((current) => (current?.card === card ? { card, printings: [] } : current)),
    );
  };

  return (
    <View className="gap-lg">
      <Input
        accessibilityLabel="Card name"
        placeholder="Card name"
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        value={text}
        onChangeText={(next) => {
          setText(next);
          setChosen(null);
        }}
      />
      {chosen ? (
        <CardPrintings chosen={chosen} onChoose={onChoose} />
      ) : (
        <View className="gap-xs">
          {shownNames.length === 0 && found?.text === text && text.trim() ? (
            <Text className="text-text-muted">{`No card names match "${text.trim()}".`}</Text>
          ) : null}
          {shownNames.map((card) => (
            <Surface key={card.oracleId} onPress={() => chooseName(card)} className="justify-center rounded-sm p-md">
              <Text variant="body-strong">{card.name}</Text>
            </Surface>
          ))}
        </View>
      )}
    </View>
  );
}
