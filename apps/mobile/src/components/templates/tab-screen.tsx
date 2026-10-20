import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { SearchBarProps } from 'react-native-screens';

import { FlashList, type FlashListProps } from '@/components/atoms/flash-list';
import { cardListContentClass } from '@/components/molecules/card-grid';
import { cardsPerRow } from '@/components/molecules/card-tile';
import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const screenClass = 'flex-1 bg-background';

const keepsScrollOffset = { disabled: true };

const insetClass = 'px-lg';

const contentClass = 'pb-xl pt-sm';

type ScreenTitleProps = {
  title: string;
  search?: SearchBarProps;
};

function ScreenTitle({ title, search }: ScreenTitleProps) {
  return (
    <Stack.Screen
      options={{
        title,
        headerSearchBarOptions: search && {
          placement: 'stacked',
          hideWhenScrolling: false,
          tintColor: colors.primary,
          textColor: colors.text,
          ...search,
        },
      }}
    />
  );
}

type TabHeaderProps = ScreenTitleProps & {
  actions?: ReactNode;
};

function TabHeader({ title, actions, search }: TabHeaderProps) {
  return (
    <>
      <ScreenTitle title={title} search={search} />
      <Stack.Toolbar placement="right">
        {actions}
        <Stack.Toolbar.Button
          icon="gearshape.fill"
          tintColor={colors.text}
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
        />
      </Stack.Toolbar>
    </>
  );
}

type TabScreenProps = Omit<TabHeaderProps, 'search'> & {
  children: ReactNode;
};

export function TabScreen({ title, actions, children }: TabScreenProps) {
  return (
    <>
      <TabHeader title={title} actions={actions} />
      <ScrollView
        className={screenClass}
        contentContainerClassName={cn(insetClass, contentClass, 'gap-lg')}
        contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </>
  );
}

type ListProps<Item> = Omit<
  FlashListProps<Item>,
  'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior' | 'numColumns'
> & {
  cardGrid?: boolean;
};

function ScreenList<Item>({ cardGrid = false, underFloatingButtons = false, ...listProps }: ListProps<Item> & { underFloatingButtons?: boolean }) {
  return (
    <FlashList
      {...listProps}
      numColumns={cardGrid ? cardsPerRow : undefined}
      className={screenClass}
      contentContainerClassName={cn(cardGrid ? cardListContentClass : insetClass, contentClass, underFloatingButtons && 'pb-floating-button-clearance')}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      maintainVisibleContentPosition={keepsScrollOffset}
    />
  );
}

type TabListScreenProps<Item> = ListProps<Item> &
  TabHeaderProps & {
    floatingButtons?: ReactNode;
    leftFloatingButtons?: ReactNode;
  };

export function TabListScreen<Item>({
  title,
  actions,
  search,
  floatingButtons,
  leftFloatingButtons,
  ...listProps
}: TabListScreenProps<Item>) {
  return (
    <>
      <TabHeader title={title} actions={actions} search={search} />
      <ScreenList {...listProps} underFloatingButtons={Boolean(floatingButtons || leftFloatingButtons)} />
      {leftFloatingButtons ? <FloatingButtons side="left">{leftFloatingButtons}</FloatingButtons> : null}
      {floatingButtons ? <FloatingButtons side="right">{floatingButtons}</FloatingButtons> : null}
    </>
  );
}

export function TabStackListScreen<Item>({ title, search, ...listProps }: ListProps<Item> & ScreenTitleProps) {
  return (
    <>
      <ScreenTitle title={title} search={search} />
      <ScreenList {...listProps} />
    </>
  );
}
