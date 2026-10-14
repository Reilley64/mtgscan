import { cva } from 'class-variance-authority';
import { useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import type { CardSymbol, ManaColor } from '@/lib/card-symbols';
import { cn } from '@/lib/class-names';
import { colors, manaSplitGradient, sizes } from '@/theme';

const splitColors: Record<ManaColor, string> = {
  generic: colors.manaGeneric,
  white: colors.manaWhite,
  blue: colors.manaBlue,
  black: colors.manaBlack,
  red: colors.manaRed,
  green: colors.manaGreen,
};

const circleVariants = cva('items-center justify-center overflow-hidden rounded-full', {
  variants: {
    fill: {
      generic: 'bg-mana-generic',
      white: 'bg-mana-white',
      blue: 'bg-mana-blue',
      black: 'bg-mana-black',
      red: 'bg-mana-red',
      green: 'bg-mana-green',
      untap: 'bg-mana-glyph',
      split: '',
    },
  },
});

const glyphVariants = cva('font-mana', {
  variants: {
    onCircle: {
      true: 'text-mana-glyph',
      false: 'text-text',
    },
    corner: {
      bare: 'text-mana-symbol-bare',
      none: 'text-mana-symbol',
      'top-left': 'absolute left-mana-symbol-split-inset top-mana-symbol-split-inset text-mana-symbol-split',
      'bottom-right': 'absolute bottom-mana-symbol-split-inset right-mana-symbol-split-inset text-mana-symbol-split',
    },
  },
});

function Glyphs({ glyphs: [first, second], onCircle }: { glyphs: CardSymbol['glyphs']; onCircle: boolean }) {
  if (second === undefined) {
    return <Text className={glyphVariants({ onCircle, corner: onCircle ? 'none' : 'bare' })}>{first}</Text>;
  }
  return (
    <>
      <Text className={glyphVariants({ onCircle, corner: 'top-left' })}>{first}</Text>
      <Text className={glyphVariants({ onCircle, corner: 'bottom-right' })}>{second}</Text>
    </>
  );
}

export function ManaSymbol({ symbol }: { symbol: CardSymbol }) {
  const { fontScale } = useWindowDimensions();
  const { circle } = symbol;
  if (circle === 'none') {
    return <Glyphs glyphs={symbol.glyphs} onCircle={false} />;
  }
  const size = sizes.manaSymbol * fontScale;
  const [top, bottom] = circle === 'untap' ? [] : circle;
  const fill = circle === 'untap' ? 'untap' : bottom ? 'split' : top;
  return (
    <View className={cn('mx-px', symbol.half && 'overflow-hidden')} style={{ width: symbol.half ? size / 2 : size, height: size }}>
      <View
        className={circleVariants({ fill })}
        style={[{ width: size, height: size }, top && bottom ? { experimental_backgroundImage: manaSplitGradient(splitColors[top], splitColors[bottom]) } : null]}>
        <Glyphs glyphs={symbol.glyphs} onCircle={circle !== 'untap'} />
      </View>
    </View>
  );
}
