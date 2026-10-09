import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';

export default function RecentScreen() {
  return (
    <TabScreen title="Recent">
      <EmptyState
        title="Nothing needs you yet"
        message="Deck suggestions, planned swaps, and buylist cards show up here when they need you."
      />
    </TabScreen>
  );
}
