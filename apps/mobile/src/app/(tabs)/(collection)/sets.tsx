import type { SetRow as ListedSet } from '@mtgscan/supabase/sets';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { EmptyState } from '@/components/molecules/empty-state';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SetListSkeleton } from '@/components/molecules/set-row';
import { SetBanner } from '@/components/organisms/set-banner';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import type { FocusedRead } from '@/lib/use-focused-read';
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

function ListedSetRow({ set }: { set: ListedSet }) {
  const { owned, size } = set.completion.any;
  return (
    <SetBanner
      name={set.name}
      symbolUri={set.icon_svg_uri}
      artUri={set.set_art_uri}
      owned={owned}
      size={size}
      percent={completionPercent(set.completion.any)}
      accessibilityLabel={spokenSet(set)}
      onPress={() => router.push({ pathname: '/set', params: { code: set.code } })}
    />
  );
}

export default function SetsScreen() {
  const { read, reload } = useSets();
  const [searchText, setSearchText] = useState('');
  const trimmedSearch = searchText.trim();
  const sets = read.status === 'loaded' ? setsMatching(read.sets, trimmedSearch) : [];

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
      renderItem={({ item }) => <ListedSetRow set={item} />}
      ListEmptyComponent={<SetsPlaceholder read={read} searchText={trimmedSearch} onTryAgain={reload} />}
    />
  );
}

function RowGap() {
  return <View className="h-sm" />;
}
