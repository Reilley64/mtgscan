import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import type { CardSymbol, ManaColor } from '@/lib/card-symbols';
import { colors, manaSplitGradient } from '@/theme';

const manaColors: Record<ManaColor, string> = {
  generic: colors.manaGeneric,
  white: colors.manaWhite,
  blue: colors.manaBlue,
  black: colors.manaBlack,
  red: colors.manaRed,
  green: colors.manaGreen,
  untap: colors.manaGlyph,
};

const glyphVariants = cva('font-mana', {
  variants: {
    look: {
      plain: 'text-text',
      mana: 'text-mana-glyph',
      untap: 'text-text',
    },
    split: {
      true: 'absolute text-mana-symbol-split',
      false: 'text-mana-symbol',
    },
  },
});

function circleBackground([top, bottom = top]: readonly [ManaColor] | readonly [ManaColor, ManaColor]) {
  return { experimental_backgroundImage: manaSplitGradient(manaColors[top], manaColors[bottom]) };
}

function lookOf({ colors: symbolColors }: CardSymbol) {
  if (symbolColors.length === 0) {
    return 'plain';
  }
  return symbolColors[0] === 'untap' ? 'untap' : 'mana';
}

function Glyphs({ symbol }: { symbol: CardSymbol }) {
  const look = lookOf(symbol);
  const [first, second] = symbol.glyphs;
  if (second === undefined) {
    return <Text className={glyphVariants({ look, split: false })}>{first}</Text>;
  }
  return (
    <>
      <Text className={cn(glyphVariants({ look, split: true }), 'left-mana-symbol-split-inset top-mana-symbol-split-inset')}>{first}</Text>
      <Text className={cn(glyphVariants({ look, split: true }), 'bottom-mana-symbol-split-inset right-mana-symbol-split-inset')}>{second}</Text>
    </>
  );
}

export function ManaSymbol({ symbol }: { symbol: CardSymbol }) {
  if (symbol.colors.length === 0) {
    return <Glyphs symbol={symbol} />;
  }
  const circle = (
    <View
      className="mx-px h-mana-symbol w-mana-symbol items-center justify-center rounded-full"
      style={circleBackground(symbol.colors)}>
      <Glyphs symbol={symbol} />
    </View>
  );
  if (symbol.half) {
    return <View className="w-mana-symbol-half overflow-hidden">{circle}</View>;
  }
  return circle;
}
