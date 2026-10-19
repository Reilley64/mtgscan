import type { FinishView, SetRow as ListedSet } from '@mtgscan/supabase/sets';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetListSkeleton, SetRow } from '@/components/molecules/set-row';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import type { FocusedRead } from '@/lib/use-focused-read';
import { useFinishView } from '@/sets/finish-view-setting';
import { completionPercent, setsMatching, spokenSet } from '@/sets/set-completion';
import { useSets } from '@/sets/use-sets';

type SetsPlaceholderProps = {
  read: FocusedRead<{ status: 'loaded' }>;
  searchText: string;
  onTryAgain: () => void;
};

function SetsPlaceholder({ read, searchText, onTryAgain }: SetsPlaceholderProps) {
  if (read.status === 'failed') {
    return <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load Sets" onTryAgain={onTryAgain} />;
  }
  if (read.status === 'loading') {
    return <SetListSkeleton accessibilityLabel="Loading sets" />;
  }
  if (searchText) {
    return <EmptyState illustration={<DashedCardFrame symbol="magnifyingglass" />} title={`No sets match "${searchText}".`} />;
  }
  return null;
}

function ListedSetRow({ set, finishView }: { set: ListedSet; finishView: FinishView }) {
  const completion = set.completion[finishView];
  return (
    <SetRow
      name={set.name}
      symbolUri={set.icon_svg_uri}
      owned={completion.owned}
      size={completion.size}
      percent={completionPercent(completion)}
      accessibilityLabel={spokenSet(set, finishView)}
      onPress={() => router.push({ pathname: '/set', params: { code: set.code } })}
    />
  );
}

export default function SetsScreen() {
  const { read, reload } = useSets();
  const { finishView } = useFinishView();
  const [searchText, setSearchText] = useState('');
  const trimmedSearch = searchText.trim();
  const sets = read.status === 'loaded' ? setsMatching(read.sets, trimmedSearch, finishView) : [];

  return (
    <TabStackListScreen
      title="Sets"
      search={{
        placeholder: 'Search sets',
        autoCapitalize: 'none',
        onChangeText: (event) => setSearchText(event.nativeEvent.text),
        onCancelButtonPress: () => setSearchText(''),
      }}
      data={sets}
      keyExtractor={(set) => set.code}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => <ListedSetRow set={item} finishView={finishView} />}
      ListHeaderComponent={<FinishViewControlBar />}
      ListEmptyComponent={<SetsPlaceholder read={read} searchText={trimmedSearch} onTryAgain={reload} />}
    />
  );
}

function FinishViewControlBar() {
  return (
    <View className="pb-md">
      <FinishViewControl />
    </View>
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
