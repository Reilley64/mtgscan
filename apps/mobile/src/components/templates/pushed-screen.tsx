import type { ReactNode } from 'react';
import { FlatList, ScrollView, type FlatListProps } from 'react-native';

import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';

const screenClass = 'flex-1 bg-background';

const contentClass = 'pb-safe-offset-xl';

const endReachedScreens = 2;

export function PushedScreen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      className={screenClass}
      contentContainerClassName={cn(contentClass, 'gap-lg')}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type PushedListScreenProps<Item> = Omit<
  FlatListProps<Item>,
  'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior' | 'onEndReachedThreshold'
> & {
  floatingButtons?: ReactNode;
};

export function PushedListScreen<Item>({ floatingButtons, ...listProps }: PushedListScreenProps<Item>) {
  return (
    <>
      <FlatList
        {...listProps}
        className={screenClass}
        contentContainerClassName={contentClass}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={endReachedScreens}
      />
      {floatingButtons ? <FloatingButtons side="right">{floatingButtons}</FloatingButtons> : null}
    </>
  );
}
