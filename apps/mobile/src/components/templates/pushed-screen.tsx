import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

import { FlashList, type FlashListProps } from '@/components/atoms/flash-list';
import { cardListContentClass } from '@/components/molecules/card-grid';
import { cardsPerRow } from '@/components/molecules/card-tile';
import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { spacing } from '@/theme';

const screenClass = 'flex-1 bg-background';

const keepsScrollOffset = { disabled: true };

const edgeToEdgeHeader = { marginHorizontal: -spacing.md };

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
  FlashListProps<Item>,
  | 'style'
  | 'contentContainerStyle'
  | 'contentInset'
  | 'contentInsetAdjustmentBehavior'
  | 'onEndReachedThreshold'
  | 'numColumns'
  | 'ListHeaderComponentStyle'
> & {
  floatingButtons?: ReactNode;
};

export function PushedListScreen<Item>({ floatingButtons, ...listProps }: PushedListScreenProps<Item>) {
  return (
    <>
      <FlashList
        {...listProps}
        {...useContentInsets(false)}
        numColumns={cardsPerRow}
        className={screenClass}
        contentContainerClassName={cn(cardListContentClass, floatingButtons ? floatingButtonsContentClass : contentClass)}
        ListHeaderComponentStyle={edgeToEdgeHeader}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={endReachedScreens}
        maintainVisibleContentPosition={keepsScrollOffset}
      />
      {floatingButtons ? <FloatingButtons side="right">{floatingButtons}</FloatingButtons> : null}
    </>
  );
}
