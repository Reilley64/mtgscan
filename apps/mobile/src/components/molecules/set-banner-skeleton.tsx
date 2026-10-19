import { cva } from 'class-variance-authority';
import { useWindowDimensions, View } from 'react-native';

import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { sizes, spacing } from '@/theme';

type BannerSize = 'row' | 'header';

const banners = cva('justify-end border-selected-outline border-transparent p-md', {
  variants: {
    size: { row: 'min-h-set-banner', header: 'min-h-set-page-banner' },
  },
});

const symbols = cva('rounded-xs bg-text', {
  variants: {
    size: { row: 'size-set-banner-symbol', header: 'size-set-page-banner-symbol' },
  },
});

export function SetBannerSkeleton({ size }: { size: BannerSize }) {
  return (
    <Surface className={banners({ size })}>
      <View className="flex-row items-center gap-sm">
        <Skeleton className={symbols({ size })} />
        <View className="flex-1 gap-xs">
          <Skeleton className="h-skeleton-title-bar w-[60%]" />
          <Skeleton className="h-skeleton-meta-bar w-[30%]" />
        </View>
      </View>
    </Surface>
  );
}

type SetListSkeletonProps = {
  accessibilityLabel: string;
  banners?: number;
};

export function SetListSkeleton({ accessibilityLabel, banners }: SetListSkeletonProps) {
  const { height } = useWindowDimensions();
  const count = banners ?? Math.ceil(height / (sizes.setBanner + spacing.sm));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} className="gap-sm">
      {Array.from({ length: count }, (_, banner) => (
        <SetBannerSkeleton key={banner} size="row" />
      ))}
    </View>
  );
}
