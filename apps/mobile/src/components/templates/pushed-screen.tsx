import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { FloatingButtons } from '@/components/templates/floating-buttons';

type PushedScreenProps = {
  children: ReactNode;
  floatingButtons?: ReactNode;
  footer?: ReactNode;
};

export function PushedScreen({ children, floatingButtons, footer }: PushedScreenProps) {
  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-lg pb-safe-offset-xl"
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {floatingButtons ? <FloatingButtons>{floatingButtons}</FloatingButtons> : null}
      {footer ? <View className="gap-sm bg-background px-lg pb-safe-offset-lg pt-sm">{footer}</View> : null}
    </>
  );
}
