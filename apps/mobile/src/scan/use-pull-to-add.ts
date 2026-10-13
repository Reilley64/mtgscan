import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, PanResponder, type AccessibilityActionEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/theme';

import { scansToAdd } from './scan-batch';
import { useScanBatch } from './scan-batch-state';

export const releaseDistance = 120;
const pullSlop = 10;
const slideAwayMs = 200;
const failureNoticeMs = 4000;
const addAction = 'addScanBatch';

type PullState =
  | { phase: 'idle' | 'pulling' | 'armed' | 'failed' }
  | { phase: 'adding'; count: number }
  | { phase: 'leaving'; indicator: PullIndicatorView };

type PullIndicatorView = { label: string; symbol: 'arrow.down' | 'plus'; busy: boolean };

function cardCount(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function pullIndicatorView(pull: PullState, count: number): PullIndicatorView {
  if (pull.phase === 'leaving') {
    return pull.indicator;
  }
  if (pull.phase === 'adding') {
    return { label: `Adding ${cardCount(pull.count)}`, symbol: 'arrow.down', busy: true };
  }
  if (count === 0) {
    return { label: 'Nothing to add', symbol: 'arrow.down', busy: false };
  }
  return pull.phase === 'armed'
    ? { label: `Release to add ${cardCount(count)}`, symbol: 'plus', busy: false }
    : { label: `Pull to add ${cardCount(count)}`, symbol: 'arrow.down', busy: false };
}

export function pullTops(safeAreaTop: number) {
  const indicator = safeAreaTop + spacing.sm;
  return { indicator, belowBatchButton: indicator + sizes.button + spacing.sm };
}

type ScanScreenState = {
  count: number;
  top: number;
  busy: boolean;
  commit: () => Promise<boolean>;
};

function createPullGesture(distance: Animated.Value, onChange: (pull: PullState) => void) {
  let pull: PullState = { phase: 'idle' };
  let screen: ScanScreenState = { count: 0, top: 0, busy: true, commit: async () => false };
  const show = (next: PullState) => {
    pull = next;
    onChange(next);
  };
  const slideAway = () => {
    show({ phase: 'leaving', indicator: pullIndicatorView(pull, screen.count) });
    Animated.timing(distance, { toValue: 0, duration: slideAwayMs, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        show({ phase: 'idle' });
      }
    });
  };
  const add = async () => {
    distance.setValue(releaseDistance);
    show({ phase: 'adding', count: screen.count });
    if (await screen.commit()) {
      slideAway();
      return;
    }
    distance.setValue(0);
    show({ phase: 'failed' });
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy, moveY }) =>
      !screen.busy && dy > pullSlop && dy > Math.abs(dx) && moveY - dy > pullTops(screen.top).belowBatchButton,
    onPanResponderGrant: () => {
      distance.stopAnimation();
      distance.setValue(0);
      show({ phase: 'pulling' });
    },
    onPanResponderMove: (_, { dy }) => {
      distance.setValue(Math.max(0, dy));
      const pastThreshold = dy >= releaseDistance;
      if (pastThreshold && pull.phase === 'pulling') {
        show({ phase: 'armed' });
        if (screen.count > 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      } else if (!pastThreshold && pull.phase === 'armed') {
        show({ phase: 'pulling' });
      }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: () => {
      if (pull.phase === 'armed' && screen.count > 0 && !screen.busy) {
        void add();
      } else {
        slideAway();
      }
    },
    onPanResponderTerminate: slideAway,
  });
  return {
    panHandlers: panResponder.panHandlers,
    add,
    dismissFailure: () => show({ phase: 'idle' }),
    update: (next: ScanScreenState) => {
      screen = next;
    },
  };
}

export function usePullToAdd() {
  const { batch, latest, commit, commitStatus } = useScanBatch();
  const { top } = useSafeAreaInsets();
  const count = scansToAdd(batch).length;
  const busy = latest?.kind === 'recognizing' || commitStatus === 'adding';
  const [pull, setPull] = useState<PullState>({ phase: 'idle' });
  const [distance] = useState(() => new Animated.Value(0));
  const [gesture] = useState(() => createPullGesture(distance, setPull));

  useEffect(() => {
    gesture.update({ count, top, busy, commit });
  });

  useEffect(() => {
    if (pull.phase !== 'failed') {
      return;
    }
    const timer = setTimeout(gesture.dismissFailure, failureNoticeMs);
    return () => clearTimeout(timer);
  }, [gesture, pull.phase]);

  const batchButtonActions =
    count > 0 && !busy
      ? {
          accessibilityActions: [{ name: addAction, label: `Add ${cardCount(count)} to collection` }],
          onAccessibilityAction: ({ nativeEvent }: AccessibilityActionEvent) => {
            if (nativeEvent.actionName === addAction) {
              void gesture.add();
            }
          },
        }
      : {};

  return { pull, count, distance, panHandlers: gesture.panHandlers, batchButtonActions };
}
