import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetListSkeleton } from '@/components/molecules/set-row-skeleton';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { SetBanner } from '@/components/organisms/set-banner';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import type { FocusedRead } from '@/lib/use-focused-read';
import { useFinishView } from '@/sets/finish-view-setting';
import { setsMatching } from '@/sets/set-completion';
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
      renderItem={({ item }) => (
        <SetBanner set={item} finishView={finishView} onPress={() => router.push({ pathname: '/set', params: { code: item.code } })} />
      )}
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
