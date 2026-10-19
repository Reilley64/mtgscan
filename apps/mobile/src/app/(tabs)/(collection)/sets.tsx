import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetListSkeleton } from '@/components/molecules/set-banner-skeleton';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { SetBanner } from '@/components/organisms/set-banner';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import { useTypingPause } from '@/lib/read';
import { useFinishView } from '@/sets/finish-view-setting';
import { useSets } from '@/sets/use-sets';

type SetsPlaceholderProps = {
  read: ReturnType<typeof useSets>['read'];
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

const nextPageBanners = 2;

function NextPageSkeleton({ loading }: { loading: boolean }) {
  if (!loading) {
    return null;
  }
  return (
    <View className="pt-sm">
      <SetListSkeleton accessibilityLabel="Loading more sets" banners={nextPageBanners} />
    </View>
  );
}

export default function SetsScreen() {
  const { finishView } = useFinishView();
  const [searchText, setSearchText] = useState('');
  const [pausedSearch] = useTypingPause(searchText);
  const trimmedSearch = pausedSearch.trim();
  const { read, reload, loadMore } = useSets({ finish_view: finishView, ...(trimmedSearch ? { text: trimmedSearch } : {}) });

  return (
    <TabStackListScreen
      title="Sets"
      search={{
        placeholder: 'Search sets',
        autoCapitalize: 'none',
        onChangeText: (event) => setSearchText(event.nativeEvent.text),
        onCancelButtonPress: () => setSearchText(''),
      }}
      data={read.status === 'loaded' ? read.items : []}
      keyExtractor={(set) => set.code}
      ItemSeparatorComponent={RowGap}
      renderItem={({ item }) => (
        <SetBanner set={item} finishView={finishView} onPress={() => router.push({ pathname: '/set', params: { code: item.code } })} />
      )}
      ListHeaderComponent={<FinishViewControlBar />}
      ListEmptyComponent={<SetsPlaceholder read={read} searchText={trimmedSearch} onTryAgain={reload} />}
      ListFooterComponent={<NextPageSkeleton loading={read.status === 'loaded' && read.loadingMore} />}
      onEndReached={loadMore}
      onEndReachedThreshold={1}
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
