import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { colors, sizes, spacing } from '@/theme';

const confirmAt = 0.8;

type HandleGesture = {
  offset: Animated.Value;
  travel: number;
  enabled: boolean;
  onConfirm: () => void;
};

function springBack(offset: Animated.Value) {
  Animated.spring(offset, { toValue: 0, useNativeDriver: false }).start();
}

function handleResponder({ offset, travel, enabled, onConfirm }: HandleGesture) {
  let pastThreshold = false;
  return PanResponder.create({
    onStartShouldSetPanResponder: () => enabled,
    onMoveShouldSetPanResponder: () => enabled,
    onPanResponderGrant: () => {
      pastThreshold = false;
    },
    onPanResponderMove: (_, { dx }) => {
      const position = Math.min(Math.max(dx, 0), travel);
      offset.setValue(position);
      const past = travel > 0 && position >= travel * confirmAt;
      if (past && !pastThreshold) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      pastThreshold = past;
    },
    onPanResponderRelease: () => {
      springBack(offset);
      if (pastThreshold) {
        onConfirm();
      }
    },
    onPanResponderTerminate: () => springBack(offset),
  });
}

type SwipeToConfirmProps = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => void;
};

export function SwipeToConfirm({ label, disabled = false, busy = false, onConfirm }: SwipeToConfirmProps) {
  const [offset] = useState(() => new Animated.Value(0));
  const [travel, setTravel] = useState(0);
  const enabled = !disabled && !busy;
  const handle = useMemo(
    () => handleResponder({ offset, travel, enabled, onConfirm }),
    [offset, travel, enabled, onConfirm],
  );

  useEffect(() => {
    Animated.spring(offset, { toValue: busy ? travel : 0, useNativeDriver: false }).start();
  }, [busy, travel, offset]);

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'activate' && enabled) {
          onConfirm();
        }
      }}
      aria-disabled={disabled}
      aria-busy={busy}
      onLayout={({ nativeEvent }) => setTravel(nativeEvent.layout.width - 2 * spacing.xs - sizes.touchTarget)}
      className="h-swipe-track justify-center rounded-full bg-primary px-xs aria-disabled:opacity-dimmed">
      <View className="pointer-events-none absolute inset-0 items-center justify-center">
        <Text variant="body-strong" className="text-on-primary">
          {label}
        </Text>
      </View>
      <Animated.View {...handle.panHandlers} style={{ transform: [{ translateX: offset }] }}>
        <View className="h-touch-target w-touch-target items-center justify-center rounded-full bg-on-primary">
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <SymbolView name="arrow.right" size={sizes.iconButtonSymbol} tintColor={colors.primary} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}
