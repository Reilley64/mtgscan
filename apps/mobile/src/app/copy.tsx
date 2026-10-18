import type { CopyDetails } from '@mtgscan/supabase/collection';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { deleteCopy, setCopyProtected } from '@/collection/copy-writes';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { readCopy, useCopy } from '@/collection/use-copy';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { copyActionsMenu } from '@/components/organisms/copy-actions-menu';
import { CopyPageContent } from '@/components/organisms/copy-page-content';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { applyCommanderAction, commanderAction } from '@/decks/commander-actions';
import { removeFromDeck } from '@/decks/remove-from-deck';
import { useDecks } from '@/decks/use-decks';
import { colors } from '@/theme';

export default function CopyScreen() {
  const { copyId } = useLocalSearchParams<{ copyId: string }>();
  const { read, reload } = useCopy(copyId);
  const { priceCurrency } = usePriceCurrency();
  const { read: decksRead } = useDecks();
  const hasDecks = decksRead.status === 'loaded' && decksRead.decks.length > 0;

  useEffect(() => {
    if (read.status === 'missing') {
      Alert.alert('This card is no longer in your collection.', undefined, [{ text: 'OK', onPress: () => router.back() }]);
    }
  }, [read.status]);

  async function deleteThisCopy(held: boolean) {
    const result = await deleteCopy(copyId, held);
    if (result === 'done') {
      router.back();
    } else if (result === 'held') {
      reload();
      const heldCopy = await readCopy(copyId).catch(() => null);
      if (heldCopy?.status === 'loaded') {
        confirmDelete(heldCopy.copy);
      }
    } else if (result === 'missing') {
      reload();
    } else {
      Alert.alert('Could not delete this copy', 'Check your connection.');
    }
  }

  async function changeProtected(isProtected: boolean) {
    if ((await setCopyProtected(copyId, isProtected)) === 'failed') {
      Alert.alert(isProtected ? 'Could not protect this card' : 'Could not unprotect this card', 'Check your connection.');
      return;
    }
    reload();
  }

  function openAddToDeck(unprotect: boolean) {
    router.push({ pathname: '/add-to-deck', params: { copyId, unprotect: String(unprotect) } });
  }

  function addToDeck(isProtected: boolean) {
    if (!isProtected) {
      openAddToDeck(false);
      return;
    }
    Alert.alert('This copy is protected.', 'Putting it in a deck unprotects it.', [
      { text: 'Unprotect and add', onPress: () => openAddToDeck(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function deleteCopyMessage({ deck, held_for }: Pick<CopyDetails, 'deck' | 'held_for'>) {
    if (held_for) {
      return `This copy is held by the planned swap for ${held_for.name}. Continue and move that swap to the buylist?`;
    }
    return deck
      ? `It leaves ${deck.name} and your collection, with its user tags. This cannot be undone.`
      : 'It leaves your collection with its user tags. This cannot be undone.';
  }

  function confirmDelete({ deck, held_for }: Pick<CopyDetails, 'deck' | 'held_for'>) {
    Alert.alert('Delete this copy?', deleteCopyMessage({ deck, held_for }), [
      { text: 'Delete copy', style: 'destructive', onPress: () => deleteThisCopy(held_for !== null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <PushedScreen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" tintColor={colors.text} accessibilityLabel="Close" onPress={() => router.back()} />
      </Stack.Toolbar>
      {read.status === 'loaded' && priceCurrency ? (
        <>
          <Stack.Toolbar placement="right">
            {copyActionsMenu({
              copy: read.copy,
              canAddToDeck: hasDecks,
              commanderAction: read.copy.deck && commanderAction(read.copy.deck.role, read.copy.deck.commander_count),
              onSetProtected: changeProtected,
              onAddToDeck: () => addToDeck(read.copy.protected),
              onSetCommander: (action) => applyCommanderAction(copyId, action, reload),
              onRemoveFromDeck: () => removeFromDeck(copyId, reload),
              onDelete: () => confirmDelete(read.copy),
            })}
          </Stack.Toolbar>
          <CopyPageContent
            copy={read.copy}
            priceCurrency={priceCurrency}
            onOpenUserTags={() => router.push({ pathname: '/user-tag-picker', params: { copyId } })}
            onOpenDeck={(deckId) => router.push({ pathname: '/deck', params: { deckId } })}
          />
        </>
      ) : null}
      {read.status === 'failed' ? (
        <View className="px-lg pt-safe-offset-xl">
          <ReadFailure
            illustration={<DashedCardFrame symbol="wifi.slash" />}
            title="Could not load this card"
            onTryAgain={reload}
          />
        </View>
      ) : null}
    </PushedScreen>
  );
}
