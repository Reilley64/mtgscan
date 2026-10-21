import { useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { hiddenTopScrollEdgeEffects, softTopScrollEdgeEffects } from '@/lib/scroll-edge-effects';

export function useBannerScroll() {
  const headerBottom = useHeaderHeight();
  const [bannerHeight, setBannerHeight] = useState<number | null>(null);
  const [bannerScrolledAway, setBannerScrolledAway] = useState(false);
  return {
    bannerScrolledAway,
    scrollEdgeEffects: bannerScrolledAway ? softTopScrollEdgeEffects : hiddenTopScrollEdgeEffects,
    onBannerLayout: (event: LayoutChangeEvent) => setBannerHeight(event.nativeEvent.layout.height),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setBannerScrolledAway(bannerHeight !== null && event.nativeEvent.contentOffset.y + headerBottom >= bannerHeight),
  };
}
