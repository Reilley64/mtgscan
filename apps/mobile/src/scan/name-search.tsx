import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { CardImage } from '@/components/card-image';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import { cardPrintings, searchCardNames, type CardName } from '../../modules/card-recognizer';
import { printingCaption } from './printing-caption';
import type { Printing } from './scan-batch';
import { SheetSection } from './sheet-section';

const printingsPerRow = 3;

type NameSearchProps = {
  onChoose: (printing: Printing) => void;
};

type ChosenCard = { card: CardName; printings: Printing[] | null };

function PrintingTile({ printing, image, width, onPress }: {
  printing: Printing;
  image: string | undefined;
  width: number;
  onPress: () => void;
}) {
  const caption = printingCaption(printing);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${printing.name}, ${caption}`}
      onPress={onPress}
      style={[styles.tile, { width }]}>
      <CardImage uri={image} />
      <Text numberOfLines={1} style={styles.caption}>
        {caption}
      </Text>
    </Pressable>
  );
}

function CardPrintings({ chosen, onChoose }: { chosen: ChosenCard; onChoose: (printing: Printing) => void }) {
  const { width } = useWindowDimensions();
  const printings = chosen.printings ?? [];
  const imageOf = usePrintingImages(printings.map((printing) => printing.printingId));
  const tileWidth = (width - spacing.lg * 2 - spacing.sm * (printingsPerRow - 1)) / printingsPerRow;

  if (chosen.printings === null) {
    return null;
  }
  if (printings.length > 0 && printings.every((printing) => printing.basicLand)) {
    return <Text style={styles.message}>Basic lands are not tracked.</Text>;
  }
  return (
    <SheetSection title={chosen.card.name}>
      <View style={styles.grid}>
        {printings.map((printing) => (
          <PrintingTile
            key={printing.printingId}
            printing={printing}
            image={imageOf(printing.printingId)}
            width={tileWidth}
            onPress={() => onChoose(printing)}
          />
        ))}
      </View>
    </SheetSection>
  );
}

export function NameSearch({ onChoose }: NameSearchProps) {
  const [text, setText] = useState('');
  const [names, setNames] = useState<CardName[]>([]);
  const [chosen, setChosen] = useState<ChosenCard | null>(null);
  const latestText = useRef('');

  useEffect(() => {
    latestText.current = text;
    if (!text.trim()) {
      return;
    }
    searchCardNames(text).then(
      (found) => latestText.current === text && setNames(found),
      () => latestText.current === text && setNames([]),
    );
  }, [text]);

  const chooseName = (card: CardName) => {
    setChosen({ card, printings: null });
    cardPrintings(card.oracleId).then(
      (printings) => setChosen((current) => (current?.card === card ? { card, printings } : current)),
      () => setChosen((current) => (current?.card === card ? { card, printings: [] } : current)),
    );
  };

  return (
    <View style={styles.search}>
      <TextInput
        accessibilityLabel="Card name"
        placeholder="Card name"
        placeholderTextColor={colors.textDim}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        value={text}
        onChangeText={(next) => {
          setText(next);
          setChosen(null);
        }}
        style={styles.input}
      />
      {chosen ? (
        <CardPrintings chosen={chosen} onChoose={onChoose} />
      ) : (
        <View style={styles.names}>
          {(text.trim() ? names : []).map((card) => (
            <Pressable key={card.oracleId} accessibilityRole="button" onPress={() => chooseName(card)} style={styles.name}>
              <Text style={styles.nameLabel}>{card.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    gap: spacing.lg,
  },
  input: {
    height: sizes.button,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    backgroundColor: colors.surfaceControl,
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  names: {
    gap: spacing.xs,
  },
  name: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.sm,
    backgroundColor: colors.surface,
  },
  nameLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    gap: spacing.xs,
  },
  caption: {
    ...typography.meta,
    color: colors.textMuted,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
});
