import { router } from 'expo-router';

import { EmptyState } from '@/components/molecules/empty-state';
import { GhostCommanderCard } from '@/components/molecules/empty-state-illustrations';
import { TabScreen } from '@/components/templates/tab-screen';

export default function DecksScreen() {
  return (
    <TabScreen title="Decks">
      <EmptyState
        illustration={<GhostCommanderCard />}
        title="No decks yet"
        message="Start a deck from a commander you own."
        action={{ label: 'Open Collection', onPress: () => router.navigate('/collection') }}
      />
    </TabScreen>
  );
}
