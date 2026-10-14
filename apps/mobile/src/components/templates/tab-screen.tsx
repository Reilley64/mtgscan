import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, ScrollView, View, type FlatListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SearchBarProps } from 'react-native-screens';

import { cn } from '@/lib/class-names';
import { colors, spacing } from '@/theme';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pt-sm';

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

function FloatingButton({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View className="absolute right-lg" style={{ bottom: bottom + spacing.lg }}>
      {children}
    </View>
  );
}

type TabListScreenProps<Item> = Omit<FlatListProps<Item>, 'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior'> &
  TabHeaderProps & {
    floatingButton?: ReactNode;
  };

export function TabListScreen<Item>({ title, actions, search, floatingButton, ...listProps }: TabListScreenProps<Item>) {
  return (
    <>
      <TabHeader title={title} actions={actions} search={search} />
      <FlatList
        {...listProps}
        className={screenClass}
        contentContainerClassName={contentClass}
        contentInsetAdjustmentBehavior="automatic"
      />
      {floatingButton ? <FloatingButton>{floatingButton}</FloatingButton> : null}
    </>
  );
}
