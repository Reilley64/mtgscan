import { EmptyState } from '@/components/molecules/empty-state';
import { TabScreen } from '@/components/templates/tab-screen';

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
