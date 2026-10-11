import type { ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View, type FlatListProps } from 'react-native';

import { SettingsButton } from '@/components/settings-button';
import { colors, spacing, typography } from '@/theme';

type TabScreenProps = {
  title: string;
  children: ReactNode;
};

function TabHeader({ title }: { title: string }) {
  return (
    <View style={styles.titleRow}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <SettingsButton />
    </View>
  );
}

export function TabScreen({ title, children }: TabScreenProps) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, styles.spaced]}
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
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={<TabHeader title={title} />}
      ListHeaderComponentStyle={styles.listHeader}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  spaced: {
    gap: spacing.lg,
  },
  listHeader: {
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.largeTitle,
    color: colors.text,
  },
});
