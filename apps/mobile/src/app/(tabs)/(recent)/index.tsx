import { EmptyState } from '@/components/molecules/empty-state';
import { GhostNeedsYouItems } from '@/components/molecules/empty-state-illustrations';
import { TabScreen } from '@/components/templates/tab-screen';

export default function RecentScreen() {
  return (
    <TabScreen title="Recent">
      <EmptyState
        illustration={<GhostNeedsYouItems />}
        title="Nothing needs you yet"
        message="When a deck needs you, it shows up here."
      />
    </TabScreen>
  );
}
