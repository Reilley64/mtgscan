import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { DeckValidityContent } from '@/components/organisms/deck-validity-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useDeck } from '@/decks/use-deck';

const comprehensiveRulesUrl = 'https://magic.wizards.com/en/rules';

export default function DeckValidityDrawer() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);

  return (
    <DrawerSheet title="Deck validity">
      {read.status === 'loaded' && read.deck.evaluation ? (
        <DeckValidityContent evaluation={read.deck.evaluation} onOpenRules={() => void Linking.openURL(comprehensiveRulesUrl)} />
      ) : null}
      {read.status === 'failed' ? (
        <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={reload} />
      ) : null}
    </DrawerSheet>
  );
}
