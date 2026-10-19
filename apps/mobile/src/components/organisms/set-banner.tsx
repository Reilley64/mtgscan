import type { CardSet } from '@mtgscan/supabase/sets';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { SetArt } from '@/components/atoms/set-art';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TintedImage } from '@/components/atoms/tinted-image';
import { SetCompletionShare, SetHeader, SetRow, setOutlines, type SetCompletionProps } from '@/components/organisms/set-row';
import { setCompletionIn, spokenSet, type ShownCompletion } from '@/sets/set-completion';

type BannerSize = 'row' | 'header';

const banners = cva('overflow-hidden border-selected-outline bg-background p-0', {
  variants: {
    size: { row: 'min-h-set-banner', header: 'min-h-set-page-banner' },
    ...setOutlines,
  },
});

const symbols = cva('text-text', {
  variants: {
    size: { row: 'size-set-banner-symbol', header: 'size-set-page-banner-symbol' },
  },
});

const names = cva('', {
  variants: {
    size: { row: 'text-body-strong', header: 'text-sheet-title' },
  },
});

type SetBannerContentProps = {
  set: CardSet;
  artUri: string;
  completion: ShownCompletion;
  bannerSize: BannerSize;
};

function SetBannerContent({ set, artUri, completion, bannerSize }: SetBannerContentProps) {
  return (
    <>
      <SetArt uri={artUri} share={completion.share} />
      <View className="grow flex-row items-end gap-sm p-md">
        <View className="flex-1 flex-row items-center gap-sm">
          <TintedImage source={set.icon_svg_uri} className={symbols({ size: bannerSize })} contentFit="contain" cachePolicy="disk" />
          <View className="flex-1">
            <Text className={names({ size: bannerSize })} numberOfLines={1}>
              {set.name}
            </Text>
            <Text variant="meta">{completion.count}</Text>
          </View>
        </View>
        <SetCompletionShare completion={completion} />
      </View>
    </>
  );
}

export function SetBanner({ set, finishView, onPress }: SetCompletionProps & { onPress: () => void }) {
  if (!set.set_art_uri) {
    return <SetRow set={set} finishView={finishView} onPress={onPress} />;
  }
  const completion = setCompletionIn(set, finishView);
  return (
    <Surface
      accessibilityLabel={spokenSet(set.name, completion)}
      onPress={onPress}
      className={banners({ size: 'row', complete: completion.complete })}>
      <SetBannerContent set={set} artUri={set.set_art_uri} completion={completion} bannerSize="row" />
    </Surface>
  );
}

export function SetPageBanner({ set, finishView }: SetCompletionProps) {
  if (!set.set_art_uri) {
    return <SetHeader set={set} finishView={finishView} />;
  }
  const completion = setCompletionIn(set, finishView);
  return (
    <Surface
      accessible
      accessibilityRole="header"
      accessibilityLabel={spokenSet(set.name, completion)}
      className={banners({ size: 'header', complete: completion.complete })}>
      <SetBannerContent set={set} artUri={set.set_art_uri} completion={completion} bannerSize="header" />
    </Surface>
  );
}
