import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { Text } from '@/components/atoms/text';
import { colors, sizes, spacing } from '@/theme';

const confirmAt = 0.8;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

type SwipeToConfirmProps = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => Promise<boolean>;
};

export function SwipeToConfirm({ label, disabled = false, busy = false, onConfirm }: SwipeToConfirmProps) {
  const handleScroller = useRef<ScrollViewInstance>(null);
  const dragging = useRef(false);
  const pastThreshold = useRef(false);
  const [travel, setTravel] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const atEnd = busy || confirmed;
  const enabled = !disabled && !atEnd;
  const isPastThreshold = ({ nativeEvent }: ScrollEvent) =>
    travel > 0 && travel - nativeEvent.contentOffset.x >= travel * confirmAt;
  const confirm = async () => {
    setConfirmed(true);
    setConfirmed(await onConfirm());
  };

  useEffect(() => {
    handleScroller.current?.scrollTo({ x: atEnd ? 0 : travel, animated: true });
  }, [atEnd, travel]);

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'activate' && enabled) {
          void confirm();
        }
      }}
      aria-disabled={disabled}
      aria-busy={atEnd}
      onLayout={({ nativeEvent }) => setTravel(nativeEvent.layout.width - 2 * spacing.xs - sizes.touchTarget)}
      className="h-swipe-track justify-center rounded-full bg-primary px-xs aria-disabled:opacity-dimmed aria-busy:aria-disabled:opacity-100">
      <View className="pointer-events-none absolute inset-0 items-center justify-center">
        <Text variant="body-strong" className="text-on-primary">
          {label}
        </Text>
      </View>
      <ScrollView
        ref={handleScroller}
        horizontal
        pointerEvents="box-none"
        className="grow-0"
        contentContainerClassName="pointer-events-box-none"
        scrollEnabled={enabled}
        bounces={false}
        scrollsToTop={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: travel, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: travel }}
        onScrollBeginDrag={() => {
          dragging.current = true;
          pastThreshold.current = false;
        }}
        onScroll={(event) => {
          if (!dragging.current) {
            return;
          }
          const past = isPastThreshold(event);
          if (past && !pastThreshold.current) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          pastThreshold.current = past;
        }}
        onScrollEndDrag={(event) => {
          dragging.current = false;
          if (isPastThreshold(event)) {
            void confirm();
          } else {
            handleScroller.current?.scrollTo({ x: travel, animated: true });
          }
        }}>
        <View className="h-touch-target w-touch-target items-center justify-center rounded-full bg-on-primary">
          {atEnd ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <SymbolView name="arrow.right" size={sizes.iconButtonSymbol} tintColor={colors.primary} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
