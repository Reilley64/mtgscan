import type { Deck } from '@mtgscan/supabase/decks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SaveBar } from '@/components/molecules/save-bar';
import { StepperRow } from '@/components/molecules/stepper-row';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { basicLandCountLimit, catalogBasicLands, changedBasicLands, draftCount, type BasicLandDraft } from '@/decks/basic-lands';
import { setBasicLands } from '@/decks/deck-writes';
import { useDeck } from '@/decks/use-deck';

export default function BasicLandsDrawer() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);
  const [draft, setDraft] = useState<BasicLandDraft>({});
  const [saving, setSaving] = useState(false);

  async function save(deck: Deck) {
    setSaving(true);
    const result = await setBasicLands({ deck_id: deckId, counts: changedBasicLands(deck.basic_lands, draft) });
    setSaving(false);
    if (result === 'failed') {
      Alert.alert('Could not save the basic lands', 'Check your connection.');
    } else if (result === 'missing') {
      router.dismissTo('/decks');
    } else {
      router.back();
    }
  }

  return (
    <DrawerSheet
      title="Basic lands"
      footer={
        read.status === 'loaded' ? (
          <SaveBar
            changeCount={changedBasicLands(read.deck.basic_lands, draft).length}
            saving={saving}
            onCancel={() => router.back()}
            onSave={() => save(read.deck)}
          />
        ) : undefined
      }>
      {read.status === 'loaded' ? (
        <View className="gap-xs">
          {catalogBasicLands(read.deck.basic_lands).map((land) => (
            <StepperRow
              key={land.oracle_id}
              uri={land.image_uris[0]}
              label={land.name}
              value={draftCount(land, draft)}
              min={0}
              max={basicLandCountLimit}
              onChange={(count) => setDraft((current) => ({ ...current, [land.oracle_id]: count }))}
            />
          ))}
        </View>
      ) : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
