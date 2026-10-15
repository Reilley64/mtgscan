import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { FloatingButtons } from '@/components/templates/floating-buttons';

type PushedScreenProps = {
  children: ReactNode;
  floatingButtons?: ReactNode;
};

export function PushedScreen({ children, floatingButtons }: PushedScreenProps) {
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
    </>
  );
}
