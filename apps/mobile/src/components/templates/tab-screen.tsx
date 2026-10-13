import { useState, type ReactNode } from 'react';
import {
  FlatList,
  ScrollView,
  View,
  type FlatListProps,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/atoms/text';
import { SettingsButton } from '@/components/molecules/settings-button';
import { cn } from '@/lib/class-names';

const screenClass = 'flex-1 bg-background';

const contentClass = 'px-lg pt-sm';

type HeaderProps = {
  title: string;
  actions?: ReactNode;
};

function HeaderActions({ actions, onLayout }: Pick<HeaderProps, 'actions'> & { onLayout?: (event: LayoutChangeEvent) => void }) {
  return (
    <View className="flex-row items-center gap-sm" onLayout={onLayout}>
      {actions}
      <SettingsButton />
    </View>
  );
}

function LargeHeader({
  title,
  actions,
  collapsed,
  onActionsLayout,
}: HeaderProps & { collapsed: boolean; onActionsLayout: (event: LayoutChangeEvent) => void }) {
  return (
    <View
      className="flex-row items-center justify-between gap-sm"
      accessibilityElementsHidden={collapsed}
      importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}>
      <Text variant="large-title">{title}</Text>
      <HeaderActions actions={actions} onLayout={onActionsLayout} />
    </View>
  );
}

function CollapsedHeader({ title, actions, actionsWidth }: HeaderProps & { actionsWidth: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="absolute inset-x-0 top-0 border-b border-line bg-background px-lg" style={{ paddingTop: insets.top }}>
      <View className="h-collapsed-header flex-row items-center gap-sm">
        <View className="flex-1" />
        <Text variant="sheet-title" numberOfLines={1}>
          {title}
        </Text>
        <View className="flex-1 items-end" style={{ minWidth: actionsWidth }}>
          <HeaderActions actions={actions} />
        </View>
      </View>
    </View>
  );
}

function useCollapsingHeader() {
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(false);
  const [actionsWidth, setActionsWidth] = useState(0);
  return {
    collapsed,
    actionsWidth,
    onActionsLayout: (event: LayoutChangeEvent) => setActionsWidth(event.nativeEvent.layout.width),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setCollapsed(event.nativeEvent.contentOffset.y + insets.top > 0),
  };
}

type TabScreenProps = HeaderProps & {
  children: ReactNode;
};

export function TabScreen({ title, actions, children }: TabScreenProps) {
  const { collapsed, actionsWidth, onActionsLayout, onScroll } = useCollapsingHeader();
  return (
    <View className={screenClass}>
      <ScrollView
        className={screenClass}
        contentContainerClassName={cn(contentClass, 'gap-lg')}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
        onScroll={onScroll}>
        <LargeHeader title={title} actions={actions} collapsed={collapsed} onActionsLayout={onActionsLayout} />
        {children}
      </ScrollView>
      {collapsed && <CollapsedHeader title={title} actions={actions} actionsWidth={actionsWidth} />}
    </View>
  );
}

type TabListScreenProps<Item> = Omit<
  FlatListProps<Item>,
  'style' | 'contentContainerStyle' | 'contentInsetAdjustmentBehavior' | 'ListHeaderComponent' | 'onScroll'
> &
  HeaderProps;

export function TabListScreen<Item>({ title, actions, ...listProps }: TabListScreenProps<Item>) {
  const { collapsed, actionsWidth, onActionsLayout, onScroll } = useCollapsingHeader();
  return (
    <View className={screenClass}>
      <FlatList
        {...listProps}
        className={screenClass}
        contentContainerClassName={contentClass}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
        onScroll={onScroll}
        ListHeaderComponent={<LargeHeader title={title} actions={actions} collapsed={collapsed} onActionsLayout={onActionsLayout} />}
        ListHeaderComponentClassName="mb-lg"
      />
      {collapsed && <CollapsedHeader title={title} actions={actions} actionsWidth={actionsWidth} />}
    </View>
  );
}
