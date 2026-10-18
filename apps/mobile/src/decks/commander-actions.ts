import type { DeckRole } from '@mtgscan/supabase/decks';
import type { SFSymbol } from 'expo-symbols';
import { Alert } from 'react-native';

import { setDeckCommander } from '@/decks/deck-writes';

export type CommanderAction = {
  title: string;
  symbol: SFSymbol;
  failureTitle: string;
  commander: boolean;
};

const makeCommander: CommanderAction = { title: 'Make commander', symbol: 'crown', failureTitle: 'Could not make this card a commander', commander: true };
const makePartner: CommanderAction = { title: 'Make partner', symbol: 'crown', failureTitle: 'Could not make this card a commander', commander: true };
const moveToMainDeck: CommanderAction = { title: 'Move to main deck', symbol: 'rectangle.stack', failureTitle: 'Could not move this card to the main deck', commander: false };

export function commanderAction(role: DeckRole, commanderCount: number): CommanderAction | null {
  if (role === 'commander') {
    return moveToMainDeck;
  }
  if (commanderCount === 0) {
    return makeCommander;
  }
  return commanderCount === 1 ? makePartner : null;
}

export async function applyCommanderAction(copyId: string, action: CommanderAction, onDone: () => void) {
  if ((await setDeckCommander(copyId, action.commander)) === 'failed') {
    Alert.alert(action.failureTitle, 'Check your connection.');
    return;
  }
  onDone();
}
