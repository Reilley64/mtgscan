import type { DeckRow } from '@mtgscan/supabase/decks';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { copyNameLine } from '@/collection/copy-labels';
import { useCopy } from '@/collection/use-copy';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { Text } from '@/components/atoms/text';
import { GhostCommanderCard } from '@/components/molecules/empty-state-illustrations';
import { ListRow } from '@/components/molecules/list-row';
import { ReadFailure } from '@/components/molecules/read-failure';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { deckDetail, effectStatus } from '@/decks/deck-labels';
import { addDeckCard } from '@/decks/deck-writes';
import { useAddDeckCardPreview } from '@/decks/use-add-deck-card-preview';
import { useDecks } from '@/decks/use-decks';

export default function AddToDeckSheet() {
  const { copyId, unprotect } = useLocalSearchParams<{ copyId: string; unprotect: string }>();
  const { read: copyRead } = useCopy(copyId);
  const { read: decksRead, reload } = useDecks();
  const { read: previewRead } = useAddDeckCardPreview(copyId);
  const effects = new Map(previewRead.status === 'loaded' ? previewRead.preview.items.map((item) => [item.deck_id, item.effect]) : []);

  async function add(deck: DeckRow) {
    const result = await addDeckCard({ deck_id: deck.deck_id, copy_id: copyId, unprotect: unprotect === 'true' });
    if (result === 'failed') {
      Alert.alert('Could not add this card', 'Check your connection.');
      return;
    }
    router.back();
    if (result === 'not_free') {
      Alert.alert('This card is already in a deck.');
    }
  }

  function statusOf(deck: DeckRow) {
    const effect = effects.get(deck.deck_id);
    return effect ? effectStatus(effect, deck.name) : undefined;
  }

  return (
    <DrawerSheet title="Add to deck">
      {copyRead.status === 'loaded' ? <Text variant="meta">{copyNameLine(copyRead.copy)}</Text> : null}
      {decksRead.status === 'loaded'
        ? decksRead.decks.map((deck) => (
            <ListRow
              key={deck.deck_id}
              leading={<CommanderAvatar uri={deck.commanders[0]?.art_crop_uri ?? null} size="row" />}
              title={deck.name}
              detail={deckDetail(deck)}
              status={statusOf(deck)}
              onPress={() => add(deck)}
            />
          ))
        : null}
      {decksRead.status === 'failed' ? (
        <ReadFailure illustration={<GhostCommanderCard />} title="Could not load your decks" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
