import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetHeader } from '@/components/molecules/set-row';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { SetCardsRowView, setCardsRows } from '@/components/organisms/set-cards';
import { SetSkeleton } from '@/components/organisms/set-skeleton';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import { useFinishView } from '@/sets/finish-view-setting';
import { completionPercent, spokenSet } from '@/sets/set-completion';
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
    const { set } = read;
    const completion = set.completion[finishView];
    return (
      <View className="gap-md pb-sm">
        <SetHeader
          name={set.name}
          symbolUri={set.icon_svg_uri}
          owned={completion.owned}
          size={completion.size}
          percent={completionPercent(completion)}
          accessibilityLabel={spokenSet(set, finishView)}
        />
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
