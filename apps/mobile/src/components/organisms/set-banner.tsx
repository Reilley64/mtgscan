import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { SetArt } from '@/components/atoms/set-art';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TintedImage } from '@/components/atoms/tinted-image';
import { SetCompletionShare, SetHeader, SetRow } from '@/components/molecules/set-row';

type BannerSize = 'row' | 'header';

const banners = cva('overflow-hidden border-selected-outline bg-background p-0', {
  variants: {
    size: { row: 'min-h-set-banner', header: 'min-h-set-page-banner' },
    complete: { true: 'border-primary', false: 'border-transparent' },
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

type SetBannerProps = ComponentProps<typeof SetHeader> & { artUri: string | null };

function SetBannerContent({ name, symbolUri, artUri, owned, size, percent, bannerSize }: SetBannerProps & { artUri: string; bannerSize: BannerSize }) {
  return (
    <>
      <SetArt uri={artUri} share={owned / size} />
      <View className="grow flex-row items-end gap-sm p-md">
        <View className="flex-1 flex-row items-center gap-sm">
          <TintedImage source={symbolUri} className={symbols({ size: bannerSize })} contentFit="contain" cachePolicy="disk" />
          <View className="flex-1">
            <Text className={names({ size: bannerSize })} numberOfLines={1}>
              {name}
            </Text>
            <Text variant="meta">{`${owned} of ${size}`}</Text>
          </View>
        </View>
        <SetCompletionShare complete={owned === size} percent={percent} />
      </View>
    </>
  );
}

export function SetBanner({ artUri, onPress, ...completion }: SetBannerProps & { onPress: () => void }) {
  if (!artUri) {
    return <SetRow onPress={onPress} {...completion} />;
  }
  return (
    <Surface
      accessibilityLabel={completion.accessibilityLabel}
      onPress={onPress}
      className={banners({ size: 'row', complete: completion.owned === completion.size })}>
      <SetBannerContent artUri={artUri} bannerSize="row" {...completion} />
    </Surface>
  );
}

export function SetPageBanner({ artUri, ...completion }: SetBannerProps) {
  if (!artUri) {
    return <SetHeader {...completion} />;
  }
  return (
    <Surface
      accessible
      accessibilityRole="header"
      accessibilityLabel={completion.accessibilityLabel}
      className={banners({ size: 'header', complete: completion.owned === completion.size })}>
      <SetBannerContent artUri={artUri} bannerSize="header" {...completion} />
    </Surface>
  );
}
