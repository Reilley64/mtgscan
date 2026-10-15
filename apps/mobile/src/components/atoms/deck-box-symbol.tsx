import { View } from 'react-native';

import { TintedImage } from '@/components/atoms/tinted-image';

const deckBox = require('../../../assets/deck-box.svg');

export function DeckBoxSymbol() {
  return (
    <View className="size-deck-box-symbol">
      <TintedImage source={deckBox} className="absolute inset-0 text-info" contentFit="contain" />
    </View>
  );
}
