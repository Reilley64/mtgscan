import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { EstimatedBracketContent } from '@/components/organisms/estimated-bracket-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { estimatedBracketName } from '@/decks/deck-labels';
import { useDeck } from '@/decks/use-deck';

const commanderFormatUrl = 'https://magic.wizards.com/en/formats/commander';

export default function EstimatedBracketDrawer() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);
  const evaluation = read.status === 'loaded' ? read.deck.evaluation : null;

  return (
    <DrawerSheet title={evaluation ? estimatedBracketName(evaluation.estimated_bracket) : 'Estimated bracket'}>
      {evaluation ? <EstimatedBracketContent evaluation={evaluation} onOpenGuidance={() => void Linking.openURL(commanderFormatUrl)} /> : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
