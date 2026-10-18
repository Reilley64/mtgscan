import type { AddDeckCardPreviewQuery, DeckRow } from '@mtgscan/supabase/decks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { copyNameLine } from '@/collection/copy-labels';
import { useCopy } from '@/collection/use-copy';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { Text } from '@/components/atoms/text';
import { GhostCommanderCard } from '@/components/molecules/empty-state-illustrations';
import { ListRow } from '@/components/molecules/list-row';
import { ReadFailure } from '@/components/molecules/read-failure';
import { StepperRow } from '@/components/molecules/stepper-row';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { deckDetail, effectStatus } from '@/decks/deck-labels';
import { addDeckCard, changeBasicLand } from '@/decks/deck-writes';
import { useAddDeckCardPreview } from '@/decks/use-add-deck-card-preview';
import { useBasicLandCards } from '@/decks/use-basic-land-cards';
import { useDecks } from '@/decks/use-decks';

const basicLandCountLimit = 99;

type DeckRowsProps = {
  previewQuery: AddDeckCardPreviewQuery;
  onAdd: (deck: DeckRow) => void;
};

function DeckRows({ previewQuery, onAdd }: DeckRowsProps) {
  const { read: decksRead, reload } = useDecks();
  const { read: previewRead } = useAddDeckCardPreview(previewQuery);
  const effects = new Map(previewRead.status === 'loaded' ? previewRead.preview.items.map((item) => [item.deck_id, item.effect]) : []);

  function statusOf(deck: DeckRow) {
    const effect = effects.get(deck.deck_id);
    return effect ? effectStatus(effect, deck.name) : undefined;
  }

  return (
    <>
      {decksRead.status === 'loaded'
        ? decksRead.decks.map((deck) => (
            <ListRow
              key={deck.deck_id}
              leading={<CommanderAvatar uri={deck.commanders[0]?.art_crop_uri ?? null} size="row" />}
              title={deck.name}
              detail={deckDetail(deck)}
              status={statusOf(deck)}
              onPress={() => onAdd(deck)}
            />
          ))
        : null}
      {decksRead.status === 'failed' ? (
        <ReadFailure illustration={<GhostCommanderCard />} title="Could not load your decks" onTryAgain={reload} />
      ) : null}
    </>
  );
}

function AddCopy({ copyId, unprotect }: { copyId: string; unprotect: boolean }) {
  const { read: copyRead } = useCopy(copyId);

  async function add(deck: DeckRow) {
    const result = await addDeckCard({ deck_id: deck.deck_id, copy_id: copyId, unprotect });
    if (result === 'failed') {
      Alert.alert('Could not add this card', 'Check your connection.');
      return;
    }
    router.back();
    if (result === 'not_free') {
      Alert.alert('This card is already in a deck.');
    }
  }

  return (
    <>
      {copyRead.status === 'loaded' ? <Text variant="meta">{copyNameLine(copyRead.copy)}</Text> : null}
      <DeckRows previewQuery={{ copy_id: copyId }} onAdd={add} />
    </>
  );
}

function AddBasicLand({ oracleId }: { oracleId: string }) {
  const { read: landsRead } = useBasicLandCards();
  const land = landsRead.status === 'loaded' ? landsRead.lands.find((candidate) => candidate.oracle_id === oracleId) : undefined;
  const [count, setCount] = useState(1);

  async function add(deck: DeckRow) {
    const result = await changeBasicLand({ deck_id: deck.deck_id, oracle_id: oracleId, by: count });
    if (result === 'done') {
      router.back();
    } else if (result === 'refused') {
      Alert.alert('Could not add these basic lands', `A deck has up to ${basicLandCountLimit} of each basic land.`);
    } else {
      Alert.alert('Could not add these basic lands', 'Check your connection.');
    }
  }

  return (
    <>
      {land ? (
        <StepperRow uri={land.image_uris[0]} label={land.name} value={count} min={1} max={basicLandCountLimit} onChange={setCount} />
      ) : null}
      <DeckRows previewQuery={{ basic_land_oracle_id: oracleId, count }} onAdd={add} />
    </>
  );
}

export default function AddToDeckSheet() {
  const { copyId, unprotect, basicLandOracleId } = useLocalSearchParams<{ copyId?: string; unprotect?: string; basicLandOracleId?: string }>();
  return (
    <DrawerSheet title="Add to deck">
      {basicLandOracleId ? <AddBasicLand oracleId={basicLandOracleId} /> : <AddCopy copyId={copyId!} unprotect={unprotect === 'true'} />}
    </DrawerSheet>
  );
}
