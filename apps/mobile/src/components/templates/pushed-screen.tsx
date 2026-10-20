import type { ReactNode } from 'react';
import { FlatList, ScrollView, type FlatListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { navigationBar } from '@/theme';

const screenClass = 'flex-1 bg-background';

const contentClass = 'pb-xl';

const floatingButtonsContentClass = 'pb-floating-button-clearance';

const endReachedScreens = 2;

function useContentInsets(withBar: boolean) {
  const headerBottom = useSafeAreaInsets().top + navigationBar;
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
