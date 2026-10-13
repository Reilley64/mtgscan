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

export type PullState =
  | { phase: 'idle' | 'pulling' | 'armed' | 'failed' }
  | { phase: 'adding'; count: number }
  | { phase: 'leaving'; label: string };

function cards(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function pullLabel(pull: PullState, count: number) {
  switch (pull.phase) {
    case 'leaving':
      return pull.label;
    case 'adding':
      return `Adding ${cards(pull.count)}`;
    case 'armed':
      return count > 0 ? `Release to add ${cards(count)}` : 'Nothing to add';
    default:
      return count > 0 ? `Pull to add ${cards(count)}` : 'Nothing to add';
  }
}

export function pullTops(safeAreaTop: number) {
  const indicator = safeAreaTop + spacing.sm;
  return { indicator, start: indicator + sizes.button + spacing.sm };
}

type ScanScreenState = {
  count: number;
  top: number;
  recognizing: boolean;
  commit: () => Promise<boolean>;
};

function createPullGesture(distance: Animated.Value, onChange: (pull: PullState) => void) {
  let pull: PullState = { phase: 'idle' };
  let screen: ScanScreenState = { count: 0, top: 0, recognizing: false, commit: async () => false };
  const show = (next: PullState) => {
    pull = next;
    onChange(next);
  };
  const slideAway = () => {
    show({ phase: 'leaving', label: pullLabel(pull, screen.count) });
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
      pull.phase !== 'adding' &&
      !screen.recognizing &&
      dy > pullSlop &&
      dy > Math.abs(dx) &&
      moveY - dy > pullTops(screen.top).start,
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
      if (pull.phase === 'armed' && screen.count > 0) {
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
  const { batch, latest, commit } = useScanBatch();
  const { top } = useSafeAreaInsets();
  const count = scansToAdd(batch).length;
  const [pull, setPull] = useState<PullState>({ phase: 'idle' });
  const [distance] = useState(() => new Animated.Value(0));
  const [gesture] = useState(() => createPullGesture(distance, setPull));

  useEffect(() => {
    gesture.update({ count, top, recognizing: latest?.kind === 'recognizing', commit });
  });

  useEffect(() => {
    if (pull.phase !== 'failed') {
      return;
    }
    const timer = setTimeout(gesture.dismissFailure, failureNoticeMs);
    return () => clearTimeout(timer);
  }, [gesture, pull.phase]);

  const batchButtonActions =
    count > 0 && pull.phase !== 'adding'
      ? {
          accessibilityActions: [{ name: addAction, label: `Add ${cards(count)} to collection` }],
          onAccessibilityAction: ({ nativeEvent }: AccessibilityActionEvent) => {
            if (nativeEvent.actionName === addAction) {
              void gesture.add();
            }
          },
        }
      : {};

  return { pull, count, distance, panHandlers: gesture.panHandlers, batchButtonActions };
}
