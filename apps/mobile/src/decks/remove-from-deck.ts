import { Alert } from 'react-native';

import { changeBasicLand, removeDeckCard } from '@/decks/deck-writes';

const removeFailure = ['Could not remove this card', 'Check your connection.'] as const;

export async function removeFromDeck(copyId: string, onDone: () => void) {
  if ((await removeDeckCard(copyId)) === 'failed') {
    Alert.alert(...removeFailure);
    return;
  }
  onDone();
}

export async function removeBasicLandFromDeck(deckId: string, oracleId: string, onDone: () => void) {
  if ((await changeBasicLand({ deck_id: deckId, oracle_id: oracleId, by: -1 })) === 'failed') {
    Alert.alert(...removeFailure);
    return;
  }
  onDone();
}
