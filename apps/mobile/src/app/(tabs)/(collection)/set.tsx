import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { FinishViewControl } from '@/components/organisms/finish-view-control';
import { SetPageBanner } from '@/components/organisms/set-banner';
import { SetCardsItemView, setCardsItems } from '@/components/organisms/set-cards';
import { SetSkeleton } from '@/components/organisms/set-skeleton';
import { TabStackListScreen } from '@/components/templates/tab-screen';
import { useBannerTitle } from '@/lib/use-banner-title';
import { useFinishView } from '@/sets/finish-view-setting';
import { useSet } from '@/sets/use-set';

export default function SetScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { read, reload } = useSet(code);
  const { finishView } = useFinishView();
  const { showsTitle, onBannerLayout, onScroll } = useBannerTitle();

  function header() {
    if (read.status === 'loading') {
      return <SetSkeleton />;
    }
    if (read.status === 'failed') {
      return <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this set" onTryAgain={reload} />;
    }
    return (
      <View className="gap-md pb-sm">
        <View onLayout={onBannerLayout}>
          <SetPageBanner set={read.set} finishView={finishView} />
        </View>
        <FinishViewControl />
      </View>
    );
  }

  return (
    <TabStackListScreen
      title={read.status === 'loaded' && showsTitle ? read.set.name : ''}
      data={read.status === 'loaded' ? setCardsItems(read.set, finishView) : []}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      isTile={(item) => item.kind === 'card-printing'}
      renderItem={({ item }) => <SetCardsItemView item={item} />}
      ListHeaderComponent={header()}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
}
