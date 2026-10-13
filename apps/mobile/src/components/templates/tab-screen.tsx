import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, ScrollView, type FlatListProps } from 'react-native';

import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pt-sm';

type TabHeaderProps = {
  title: string;
  actions?: ReactNode;
};

function TabHeader({ title, actions }: TabHeaderProps) {
  return (
    <>
      <Stack.Screen options={{ title }} />
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

type TabScreenProps = TabHeaderProps & {
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
  TabHeaderProps;

export function TabListScreen<Item>({ title, actions, ...listProps }: TabListScreenProps<Item>) {
  return (
    <>
      <TabHeader title={title} actions={actions} />
      <FlatList
        {...listProps}
        className={screenClass}
        contentContainerClassName={contentClass}
        contentInsetAdjustmentBehavior="automatic"
      />
    </>
  );
}
