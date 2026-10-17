import type { DeckChangeKind, RevertPreview } from '@mtgscan/supabase/decks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Chip } from '@/components/atoms/chip';
import { Text } from '@/components/atoms/text';
import { ChangeLine } from '@/components/molecules/change-line';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { ReadFailure } from '@/components/molecules/read-failure';
import { WarningLine } from '@/components/molecules/warning-line';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { changeLineOf } from '@/decks/deck-change-lines';
import { effectChip } from '@/decks/deck-labels';
import { revertDeckChanges } from '@/decks/deck-writes';
import { blockMessage, heldCopyMessage, protectedCopyMessage, undoText } from '@/decks/revert-labels';
import { useRevertPreview } from '@/decks/use-revert-preview';
import { colors } from '@/theme';

type RevertParams = {
  deckId: string;
  deckName: string;
  deckChangeId: string;
  kind: DeckChangeKind;
  changeRevision: string;
};

export default function RevertSheet() {
  const { deckId, deckName, deckChangeId, kind, changeRevision } = useLocalSearchParams<RevertParams>();
  const { read, reload } = useRevertPreview(deckId, deckChangeId);
  const [reverting, setReverting] = useState(false);
  const preview = read.status === 'loaded' ? read.preview : null;

  async function revert(loaded: RevertPreview) {
    setReverting(true);
    const result = await revertDeckChanges({
      deck_id: deckId,
      deck_change_id: deckChangeId,
      expected_revision: loaded.revision,
      unprotect: loaded.protected_copies.length > 0,
    });
    setReverting(false);
    if (result === 'failed') {
      Alert.alert('Could not revert this change', 'Check your connection.');
    } else if (result === 'outdated') {
      reload();
    } else {
      router.back();
    }
  }

  return (
    <DrawerSheet>
      <Stack.Screen options={{ title: 'Revert' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button tintColor={colors.text} onPress={() => router.back()}>
          Cancel
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.primary}
          disabled={!preview || preview.blocks.length > 0 || reverting}
          onPress={() => preview && void revert(preview)}>
          Revert
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {preview ? (
        <>
          <Text>{undoText(kind, preview.revision - Number(changeRevision), deckName)}</Text>
          {preview.effect ? <Chip {...effectChip(preview.effect, deckName)} /> : null}
          {preview.lines.map(changeLineOf).map(({ key, ...line }) => (
            <ChangeLine key={key} {...line} />
          ))}
          {preview.blocks.map((block) => (
            <FailureNotice key={block.copy_id} message={blockMessage(block)} />
          ))}
          {preview.protected_copies.map((copy) => (
            <WarningLine key={copy.copy_id} message={protectedCopyMessage(copy.name)} />
          ))}
          {preview.held_copies.map((copy) => (
            <WarningLine key={copy.copy_id} symbol="held" message={heldCopyMessage(copy)} />
          ))}
        </>
      ) : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this revert" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
