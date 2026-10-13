import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FailureNotice } from '@/components/molecules/failure-notice';
import { PullIndicator } from '@/components/molecules/pull-indicator';
import { sizes } from '@/theme';

import { pullIndicatorView, pullTops, releaseDistance, type usePullToAdd } from './use-pull-to-add';

type PullToAddProps = Pick<ReturnType<typeof usePullToAdd>, 'pull' | 'count' | 'distance'>;

export function PullToAdd({ pull, count, distance }: PullToAddProps) {
  const tops = pullTops(useSafeAreaInsets().top);
  if (pull.phase === 'idle') {
    return null;
  }
  if (pull.phase === 'failed') {
    return (
      <View className="absolute inset-x-lg" style={{ top: tops.belowBatchButton }}>
        <FailureNotice message="Could not add to your collection. Your scans are kept." />
      </View>
    );
  }
  const translateY = distance.interpolate({
    inputRange: [0, releaseDistance],
    outputRange: [-(tops.indicator + sizes.button), 0],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-x-lg items-center"
      style={{ top: tops.indicator, transform: [{ translateY }] }}>
      <PullIndicator {...pullIndicatorView(pull, count)} />
    </Animated.View>
  );
}
