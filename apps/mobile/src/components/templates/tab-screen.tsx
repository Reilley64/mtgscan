import type { ReactNode } from 'react';
import { FlatList, ScrollView, View, type FlatListProps } from 'react-native';

import { Text } from '@/components/atoms/text';
import { SettingsButton } from '@/components/molecules/settings-button';
import { cn } from '@/lib/class-names';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pt-sm';

type TabScreenProps = {
  title: string;
  children: ReactNode;
};

function TabHeader({ title }: { title: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="large-title">{title}</Text>
      <SettingsButton />
    </View>
  );
}

export function TabScreen({ title, children }: TabScreenProps) {
  return (
    <ScrollView
      className={screenClass}
      contentContainerClassName={cn(contentClass, 'gap-lg')}
      contentInsetAdjustmentBehavior="automatic">
      <TabHeader title={title} />
      {children}
    </ScrollView>
  );
}

type TabListScreenProps<Item> = Omit<
  FlatListProps<Item>,
  'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior' | 'ListHeaderComponent'
> & {
  title: string;
};

export function TabListScreen<Item>({ title, ...listProps }: TabListScreenProps<Item>) {
  return (
    <FlatList
      {...listProps}
      className={screenClass}
      contentContainerClassName={contentClass}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={<TabHeader title={title} />}
      ListHeaderComponentClassName="mb-lg"
    />
  );
}
