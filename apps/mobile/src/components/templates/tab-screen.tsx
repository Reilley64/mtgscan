import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, ScrollView, type FlatListProps } from 'react-native';
import type { SearchBarProps } from 'react-native-screens';

import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pt-sm';

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
        contentContainerClassName={cn(contentClass, 'gap-lg')}
        contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </>
  );
}

type ListProps<Item> = Omit<FlatListProps<Item>, 'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior'>;

function ScreenList<Item>(listProps: ListProps<Item>) {
  return (
    <FlatList
      {...listProps}
      className={screenClass}
      contentContainerClassName={contentClass}
      contentInsetAdjustmentBehavior="automatic"
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
      <ScreenList {...listProps} />
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
