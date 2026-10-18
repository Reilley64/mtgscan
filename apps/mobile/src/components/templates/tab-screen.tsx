import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, ScrollView, type FlatListProps } from 'react-native';
import type { SearchBarProps } from 'react-native-screens';

import { FloatingButtons } from '@/components/templates/floating-buttons';
import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pb-xl pt-sm';

type TabHeaderProps = {
  title: string;
  actions?: ReactNode;
  search?: SearchBarProps;
};

function TabHeader({ title, actions, search }: TabHeaderProps) {
  return (
    <>
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

type TabListScreenProps<Item> = Omit<FlatListProps<Item>, 'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior'> &
  TabHeaderProps & {
    floatingButtons?: ReactNode;
  };

export function TabListScreen<Item>({ title, actions, search, floatingButtons, ...listProps }: TabListScreenProps<Item>) {
  return (
    <>
      <TabHeader title={title} actions={actions} search={search} />
      <FlatList
        {...listProps}
        className={screenClass}
        contentContainerClassName={cn(contentClass, floatingButtons && 'pb-floating-button-clearance')}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
      />
      {floatingButtons ? <FloatingButtons>{floatingButtons}</FloatingButtons> : null}
    </>
  );
}
