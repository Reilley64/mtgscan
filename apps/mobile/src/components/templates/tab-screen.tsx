import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { SearchBarProps } from 'react-native-screens';

import { FlashList } from '@/components/atoms/flash-list';
import { CardGridList, type CardGridListProps } from '@/components/molecules/card-grid';
import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const screenClass = 'flex-1 bg-background';

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

const screenListProps = { className: screenClass, contentInsetAdjustmentBehavior: 'automatic', keyboardDismissMode: 'on-drag' } as const;

type ListProps<Item> = Omit<CardGridListProps<Item>, 'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior' | 'isTile' | 'header'> & {
  isTile?: (item: Item) => boolean;
};

function ScreenList<Item>({ isTile, underFloatingButtons = false, ...listProps }: ListProps<Item> & { underFloatingButtons?: boolean }) {
  const contentClassName = cn(contentClass, underFloatingButtons && 'pb-floating-button-clearance');
  return isTile ? (
    <CardGridList {...listProps} {...screenListProps} isTile={isTile} contentContainerClassName={contentClassName} />
  ) : (
    <FlashList {...listProps} {...screenListProps} contentContainerClassName={cn(insetClass, contentClassName)} />
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
