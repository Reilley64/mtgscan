import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetHeader } from '@/components/molecules/set-row';
import { SetCardsRowView, setCardsRows } from '@/components/organisms/set-cards';
import { SetSkeleton } from '@/components/organisms/set-skeleton';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import { completionPercent, spokenSet } from '@/sets/set-completion';
import { useSet } from '@/sets/use-set';

export default function SetScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { read, reload } = useSet(code);

  function header() {
    if (read.status === 'loading') {
      return <SetSkeleton />;
    }
    if (read.status === 'failed') {
      return <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this set" onTryAgain={reload} />;
    }
    const { set } = read;
    return (
      <View className="pb-sm">
        <SetHeader
          name={set.name}
          symbolUri={set.icon_svg_uri}
          owned={set.completion.any.owned}
          size={set.completion.any.size}
          percent={completionPercent(set.completion.any)}
          accessibilityLabel={spokenSet(set)}
        />
      </View>
    );
  }

  return (
    <TabStackListScreen
      title=""
      data={read.status === 'loaded' ? setCardsRows(read.set) : []}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => <SetCardsRowView row={item} />}
      ListHeaderComponent={header()}
    />
  );
}
