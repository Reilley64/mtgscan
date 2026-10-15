import { Alert } from 'react-native';

import { removeDeckCard } from '@/decks/deck-writes';

export async function removeFromDeck(copyId: string, onDone: () => void) {
  if ((await removeDeckCard(copyId)) === 'failed') {
    Alert.alert('Could not remove this card', 'Check your connection.');
    return;
  }
  onDone();
}
