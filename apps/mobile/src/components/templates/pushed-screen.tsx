import type { ReactNode } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { FloatingButtons } from '@/components/templates/floating-buttons';

type PushedScreenProps = {
  children: ReactNode;
  floatingButtons?: ReactNode;
  footer?: ReactNode;
  onEndReached?: () => void;
};

function nearTheEnd({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
  return contentOffset.y + 2 * layoutMeasurement.height >= contentSize.height;
}

export function PushedScreen({ children, floatingButtons, footer, onEndReached }: PushedScreenProps) {
  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-lg pb-safe-offset-xl"
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={onEndReached && ((event) => nearTheEnd(event) && onEndReached())}>
        {children}
      </ScrollView>
      {floatingButtons ? <FloatingButtons>{floatingButtons}</FloatingButtons> : null}
      {footer ? <View className="gap-sm bg-background px-lg pb-safe-offset-lg pt-sm">{footer}</View> : null}
    </>
  );
}
