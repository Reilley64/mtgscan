import { useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

export function useBannerTitle() {
  const headerBottom = useHeaderHeight();
  const [bannerHeight, setBannerHeight] = useState<number | null>(null);
  const [showsTitle, setShowsTitle] = useState(false);
  return {
    showsTitle,
    onBannerLayout: (event: LayoutChangeEvent) => setBannerHeight(event.nativeEvent.layout.height),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setShowsTitle(bannerHeight !== null && event.nativeEvent.contentOffset.y + headerBottom >= bannerHeight),
  };
}
