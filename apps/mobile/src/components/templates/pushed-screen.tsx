import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

export function PushedScreen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-lg pb-safe-offset-xl"
      contentInsetAdjustmentBehavior="never">
      {children}
    </ScrollView>
  );
}
