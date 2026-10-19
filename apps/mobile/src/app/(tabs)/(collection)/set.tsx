import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { SetPageBanner } from '@/components/organisms/set-banner';
import { SetCardsRowView, setCardsRows } from '@/components/organisms/set-cards';
import { SetSkeleton } from '@/components/organisms/set-skeleton';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import { useFinishView } from '@/sets/finish-view-setting';
import { useSet } from '@/sets/use-set';

export default function SetScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { read, reload } = useSet(code);
  const { finishView } = useFinishView();

  function header() {
    if (read.status === 'loading') {
      return <SetSkeleton />;
    }
    if (read.status === 'failed') {
      return <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this set" onTryAgain={reload} />;
    }
    return (
      <View className="gap-md pb-sm">
        <SetPageBanner set={read.set} finishView={finishView} />
        <FinishViewControl />
      </View>
    );
  }

  return (
    <TabStackListScreen
      title=""
      data={read.status === 'loaded' ? setCardsRows(read.set, finishView) : []}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <SetCardsRowView row={item} />}
      ListHeaderComponent={header()}
    />
  );
}
