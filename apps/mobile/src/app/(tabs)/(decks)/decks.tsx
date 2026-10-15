import { deckNameLength } from '@mtgscan/supabase/decks';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { NameAlert } from '@/components/atoms/name-alert';
import { CommanderGalleryCard } from '@/components/molecules/commander-card';
import { EmptyState } from '@/components/molecules/empty-state';
import { GhostCommanderCard } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { TabScreen } from '@/components/templates/tab-screen';
import { deckChips } from '@/decks/deck-labels';
import { createDeck } from '@/decks/deck-writes';
import { useDecks } from '@/decks/use-decks';
import { colors } from '@/theme';

function openDeck(deckId: string) {
  router.push({ pathname: '/deck', params: { deckId } });
}

export default function DecksScreen() {
  const { read, reload } = useDecks();
  const [naming, setNaming] = useState(false);

  async function create(name: string) {
    const created = await createDeck(name);
    if (created) {
      openDeck(created.deck_id);
    } else {
      Alert.alert('Could not create this deck', 'Check your connection.');
    }
  }

  return (
    <TabScreen
      title="Decks"
      actions={
        <Stack.Toolbar.Button icon="plus" tintColor={colors.text} accessibilityLabel="Create deck" onPress={() => setNaming(true)} />
      }>
      {naming ? (
        <NameAlert
          title="New deck"
          message="Name your deck."
          placeholder="Deck name"
          confirmLabel="Create"
          maxLength={deckNameLength}
          onConfirm={create}
          onClose={() => setNaming(false)}
        />
      ) : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<GhostCommanderCard />} title="Could not load your decks" onTryAgain={reload} />
      ) : null}
      {read.status === 'loaded' && read.decks.length === 0 ? (
        <EmptyState
          illustration={<GhostCommanderCard />}
          title="No decks yet"
          message="Create a deck, then add cards to it from your collection."
          action={{ label: 'Create deck', onPress: () => setNaming(true) }}
        />
      ) : null}
      {read.status === 'loaded'
        ? read.decks.map((deck) => (
            <CommanderGalleryCard
              key={deck.deck_id}
              name={deck.name}
              chips={deckChips(deck)}
              commanders={deck.commanders}
              onPress={() => openDeck(deck.deck_id)}
            />
          ))
        : null}
    </TabScreen>
  );
}
