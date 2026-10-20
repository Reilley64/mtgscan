import type { ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, type FlatListProps } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';

const screenClass = 'flex-1 bg-background';

const contentClass = 'pb-xl';

const floatingButtonsContentClass = 'pb-floating-button-clearance';

const endReachedScreens = 2;

const overlapThatKeepsTopScrollEdgeEffect = StyleSheet.hairlineWidth;

function useContentInsets(withBar: boolean) {
  const headerBottom = useHeaderHeight() + overlapThatKeepsTopScrollEdgeEffect;
  return {
    contentInsetAdjustmentBehavior: 'automatic',
    contentInset: { top: withBar ? 0 : -headerBottom },
  } as const;
}

export function PushedScreen({ withBar = false, children }: { withBar?: boolean; children: ReactNode }) {
  return (
    <ScrollView
      {...useContentInsets(withBar)}
      className={screenClass}
      contentContainerClassName={cn(contentClass, 'gap-lg')}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type PushedListScreenProps<Item> = Omit<
  FlatListProps<Item>,
  'style' | 'contentContainerStyle' | 'contentInset' | 'contentInsetAdjustmentBehavior' | 'onEndReachedThreshold'
> & {
  floatingButtons?: ReactNode;
};

export function PushedListScreen<Item>({ floatingButtons, ...listProps }: PushedListScreenProps<Item>) {
  return (
    <>
      <FlatList
        {...listProps}
        {...useContentInsets(false)}
        className={screenClass}
        contentContainerClassName={floatingButtons ? floatingButtonsContentClass : contentClass}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={endReachedScreens}
      />
      {floatingButtons ? <FloatingButtons side="right">{floatingButtons}</FloatingButtons> : null}
    </>
  );
}
