import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';

export default function DecksScreen() {
  return (
    <TabScreen title="Decks">
      <EmptyState
        title="No decks yet"
        message="A deck starts from a commander's card page."
      />
    </TabScreen>
  );
}
