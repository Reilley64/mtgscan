import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';

export default function CollectionScreen() {
  return (
    <TabScreen title="Collection">
      <EmptyState
        title="Your collection is empty"
        message="Scan cards to add them to your collection."
      />
    </TabScreen>
  );
}
