import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PullIndicator } from '@/components/molecules/pull-indicator';
import { sizes } from '@/theme';

import { pullIndicatorView, pullTops, releaseDistance, type usePullToAdd } from './use-pull-to-add';

type PullToAddProps = Pick<ReturnType<typeof usePullToAdd>, 'pull' | 'count' | 'distance'>;

export function PullToAdd({ pull, count, distance }: PullToAddProps) {
  const top = pullTops(useSafeAreaInsets().top).indicator;
  if (pull.phase === 'idle') {
    return null;
  }
  const translateY = distance.interpolate({
    inputRange: [0, releaseDistance],
    outputRange: [-(top + sizes.button), 0],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-lg items-center"
      style={{ top, transform: [{ translateY }] }}>
      <PullIndicator {...pullIndicatorView(pull, count)} />
    </Animated.View>
  );
}
