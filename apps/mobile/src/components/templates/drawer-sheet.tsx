import type { NativeStackNavigationOptions } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { colors } from '@/theme';

const sheetBackground = { backgroundColor: colors.sheet };

export const halfHeightDrawerOptions: NativeStackNavigationOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: [0.5, 1],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: false,
  contentStyle: sheetBackground,
};

export const fullHeightDrawerOptions: NativeStackNavigationOptions = {
  ...halfHeightDrawerOptions,
  sheetAllowedDetents: [1],
};

export const drawerStackOptions: NativeStackNavigationOptions = {
  headerShown: false,
  contentStyle: sheetBackground,
};

export const pushedDrawerScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  title: '',
  headerStyle: sheetBackground,
  headerShadowVisible: false,
  headerTintColor: colors.primary,
};

type DrawerSheetProps = {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function DrawerSheet({ title, footer, children }: DrawerSheetProps) {
  return (
    <>
      {title ? (
        <View collapsable={false} className="bg-sheet pb-lg pt-xl">
          <Text variant="sheet-title" className="text-center">
            {title}
          </Text>
        </View>
      ) : null}
      <ScrollView
        className="flex-1 bg-sheet"
        contentContainerClassName={cn('gap-lg px-lg pb-xl', !title && 'pt-xl')}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
      {footer ? <View className="gap-sm bg-sheet px-lg pb-safe-offset-lg pt-sm">{footer}</View> : null}
    </>
  );
}
