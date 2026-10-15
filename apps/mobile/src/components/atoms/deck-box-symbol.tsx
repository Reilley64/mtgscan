import { StyleSheet, View } from 'react-native';

import { TintedImage } from '@/components/atoms/tinted-image';

const deckBox = require('../../../assets/deck-box.svg');

export function DeckBoxSymbol() {
  return (
    <View className="size-deck-box-symbol">
      <TintedImage source={deckBox} className="text-info" contentFit="contain" style={StyleSheet.absoluteFill} />
    </View>
  );
}
